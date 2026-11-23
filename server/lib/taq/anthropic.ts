/**
 * Adaptador de TURNO com ferramentas para a Anthropic (`@anthropic-ai/sdk` 0.116).
 *
 * Criado em 23/11/2026, quando o usuário trocou a chave do Taq para a Anthropic.
 * Mesmo contrato do `gemini.ts`: um turno é UMA chamada (`messages.create`), as
 * ferramentas vão como `tools` com `input_schema` (o JSON Schema que a extensão
 * declara) e o modelo decide se responde ou se pede ferramenta (`tool_choice`
 * padrão, `auto`: nos modelos 5.5 a escolha forçada é 400).
 *
 * ── O que precisa voltar intacto (`continuacao`) ────────────────────────────
 *
 * Nos modelos atuais o raciocínio é sempre ligado e os blocos `thinking` ficam
 * presos à conversa: o turno seguinte tem de devolvê-los sem mudar nada, na
 * mesma posição, junto com o `tool_use` que eles antecedem. Por isso a resposta
 * leva os blocos do modelo serializados em `continuacao`, que a extensão guarda e
 * devolve sem ler — o mesmo papel da assinatura do Gemini. O texto do raciocínio
 * não vem (o padrão é `omitted`), e nada disso é registrado.
 *
 * ── Fallback quando o modelo recusa ─────────────────────────────────────────
 *
 * Nos modelos que aceitam (`COM_FALLBACK`), o pedido vai com `fallbacks:
 * "default"`: se os classificadores recusarem, a própria API refaz o turno noutro
 * modelo, na mesma chamada. Uma resposta que passou por isso traz um bloco
 * `fallback`, e a regra para devolvê-la é a da documentação: o que veio ANTES do
 * último `fallback` volta só como texto (sem `thinking` nem `tool_use`), e o
 * bloco `fallback` fica onde estava. As chamadas de ferramenta que a extensão
 * recebe saem só do que volta — senão o resultado apontaria para um `tool_use`
 * que o turno seguinte não tem.
 *
 * ── Esforço baixo ───────────────────────────────────────────────────────────
 *
 * Mesma escolha do Gemini: o orquestrador decide a ferramenta e redige; o
 * trabalho pesado é ler, e ler é das ferramentas.
 */
import Anthropic from '@anthropic-ai/sdk';
import { asOverloaded, asRateLimit } from '@/lib/ai/providers/anthropic';
import { ProviderError } from '@/lib/ai/types';
import type { ChamadaDeFerramenta, MensagemDoTurno } from './contrato';
import { ErroDeConversao, ErroDeLentidao, type AdaptadorDeTurno } from './gemini';

type Bloco = Anthropic.Beta.BetaContentBlockParam;

/** O pedaço do cliente que o adaptador usa — injetável nos testes. */
export interface ClienteAnthropic {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.MessageCreateParamsNonStreaming,
        opcoes?: { signal?: AbortSignal },
      ): Promise<Anthropic.Beta.BetaMessage>;
    };
  };
}

/** Modelos com fallback no servidor (`server-side-fallback-2026-07-01`). */
const COM_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

/** Modelos que recusam `output_config.effort` (anteriores à família 4.6). */
const SEM_ESFORCO = /^claude-(haiku-4-5|3)/;

/** Blocos do modelo que podem voltar numa `continuacao` — o resto é recusado. */
const TIPOS_DE_VOLTA = new Set(['text', 'tool_use', 'thinking', 'redacted_thinking', 'fallback']);

/**
 * Teto de tokens da chamada. O raciocínio conta dentro de `max_tokens`, e o
 * `maxTokensDeSaida` da extensão foi medido para a RESPOSTA (no Gemini o
 * raciocínio tem orçamento próprio). Sem a folga, um turno com raciocínio
 * longo seria cortado antes do texto.
 */
const FOLGA_DO_RACIOCINIO = 4_096;

function blocosDaContinuacao(bruto: string): Bloco[] {
  let blocos: unknown;
  try {
    blocos = JSON.parse(bruto);
  } catch {
    throw new ErroDeConversao('continuacao não é JSON.');
  }
  if (!Array.isArray(blocos)) throw new ErroDeConversao('continuacao precisa ser uma lista.');
  for (const bloco of blocos) {
    const tipo = (bloco as { type?: unknown })?.type;
    if (typeof tipo !== 'string' || !TIPOS_DE_VOLTA.has(tipo)) {
      throw new ErroDeConversao(`continuacao traz um bloco não aceito: ${String(tipo)}.`);
    }
  }
  return blocos as Bloco[];
}

/** Converte o histórico neutro no formato da Anthropic. Exportado para teste. */
export function paraMensagens(contexto: string, mensagens: MensagemDoTurno[]): Anthropic.Beta.BetaMessageParam[] {
  const saida: Anthropic.Beta.BetaMessageParam[] = [];
  let contextoPendente = contexto.trim();

  for (const m of mensagens) {
    if (m.papel === 'pessoa') {
      const blocos: Bloco[] = [];
      // O contexto entra na PRIMEIRA mensagem da pessoa, como bloco próprio e
      // rotulado como dado. No sistema ele se misturaria às instruções.
      if (contextoPendente) {
        blocos.push({ type: 'text', text: contextoPendente });
        contextoPendente = '';
      }
      blocos.push({ type: 'text', text: m.texto });
      saida.push({ role: 'user', content: blocos });
    } else if (m.papel === 'modelo') {
      const blocos: Bloco[] = m.continuacao
        ? blocosDaContinuacao(m.continuacao)
        : [
            ...(m.texto ? [{ type: 'text' as const, text: m.texto }] : []),
            ...m.chamadas.map<Bloco>((c) => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.argumentos })),
          ];
      if (blocos.length) saida.push({ role: 'assistant', content: blocos });
    } else {
      saida.push({
        role: 'user',
        content: m.resultados.map<Bloco>((r) => ({
          type: 'tool_result',
          tool_use_id: r.chamadaId,
          content: JSON.stringify(r.conteudo),
          // A extensão devolve falha como `{ erro: ... }`: o modelo precisa
          // saber que a ferramenta falhou, não ler o erro como dado.
          ...('erro' in r.conteudo ? { is_error: true } : {}),
        })),
      });
    }
  }
  return saida;
}

/**
 * Os blocos que voltam no turno seguinte, pela regra do fallback (ver o
 * cabeçalho). Exportado para teste.
 */
export function blocosParaVoltar(conteudo: Anthropic.Beta.BetaContentBlock[]): Bloco[] {
  let fronteira = -1;
  conteudo.forEach((b, i) => {
    if (b.type === 'fallback') fronteira = i;
  });
  const voltam: Bloco[] = [];
  conteudo.forEach((b, i) => {
    if (!TIPOS_DE_VOLTA.has(b.type)) return;
    const antes = i < fronteira;
    if (antes && b.type !== 'text') return;
    if (b.type === 'text') voltam.push({ type: 'text', text: b.text });
    else voltam.push(b as unknown as Bloco);
  });
  return voltam;
}

export function criarAdaptadorAnthropic(cliente: () => ClienteAnthropic): AdaptadorDeTurno {
  return {
    provedor: 'anthropic',

    async executar(modelo, pedido, sinal) {
      const comFallback = COM_FALLBACK.has(modelo);
      const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
        model: modelo,
        max_tokens: pedido.maxTokensDeSaida + FOLGA_DO_RACIOCINIO,
        // O prompt de sistema é o mesmo a cada turno da execução: o marcador de
        // cache aqui guarda ferramentas + sistema (vêm antes, nessa ordem).
        system: [{ type: 'text', text: pedido.sistema, cache_control: { type: 'ephemeral' } }],
        messages: paraMensagens(pedido.contexto, pedido.mensagens),
        ...(pedido.ferramentas.length
          ? {
              tools: pedido.ferramentas.map((f) => ({
                name: f.nome,
                description: f.descricao,
                input_schema: f.parametros as Anthropic.Beta.BetaTool.InputSchema,
              })),
            }
          : {}),
        ...(SEM_ESFORCO.test(modelo) ? {} : { output_config: { effort: 'low' as const } }),
        ...(comFallback ? { betas: [BETA_FALLBACK], fallbacks: 'default' as const } : {}),
      };

      let resposta: Anthropic.Beta.BetaMessage;
      try {
        resposta = await cliente().beta.messages.create(params, sinal ? { signal: sinal } : undefined);
      } catch (error) {
        if (error instanceof ProviderError || error instanceof ErroDeConversao) throw error;
        if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ErroDeLentidao(modelo);
        const cota = asRateLimit(modelo, error);
        if (cota) throw cota;
        const sobrecarga = asOverloaded(modelo, error);
        if (sobrecarga) throw sobrecarga;
        throw new ProviderError('anthropic', modelo, (error as Error).message ?? 'falha', error);
      }

      // Com fallback, `refusal` aqui quer dizer que a cadeia inteira recusou.
      if (resposta.stop_reason === 'refusal') {
        throw new ProviderError('anthropic', modelo, 'turno recusado pelos classificadores do provedor.');
      }

      const voltam = blocosParaVoltar(resposta.content);
      const texto = voltam
        .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const chamadas: ChamadaDeFerramenta[] = voltam
        .filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use')
        .map((b) => ({ id: b.id, nome: b.name, argumentos: (b.input ?? {}) as Record<string, unknown> }));

      const motivo = resposta.stop_reason ?? 'desconhecido';
      if (!texto && chamadas.length === 0) {
        throw new ProviderError('anthropic', modelo, `resposta vazia (stop_reason: ${motivo}).`);
      }

      // `input_tokens` EXCLUI cache; a convenção do contrato (ver pricing.ts) é
      // a entrada inteira. Escrita de cache entra como entrada — é o que custa.
      const u = resposta.usage;
      const lidoDoCache = u.cache_read_input_tokens ?? 0;
      return {
        tipo: chamadas.length
          ? 'ferramentas'
          : motivo === 'max_tokens' || motivo === 'model_context_window_exceeded'
            ? 'truncado'
            : 'final',
        texto,
        chamadas,
        ...(voltam.length ? { continuacao: JSON.stringify(voltam) } : {}),
        uso: {
          entrada: u.input_tokens + lidoDoCache + (u.cache_creation_input_tokens ?? 0),
          saida: u.output_tokens,
          ...(lidoDoCache ? { cache: lidoDoCache } : {}),
        },
        provedor: 'anthropic',
        // Quem respondeu de fato: depois de um fallback é o outro modelo.
        modelo: resposta.model || modelo,
      };
    },
  };
}

let clienteReal: Anthropic | undefined;

/** O adaptador de produção. A chave é lida só aqui, no servidor. */
export const adaptadorAnthropic = criarAdaptadorAnthropic(() => {
  if (!clienteReal) {
    const chave = process.env.ANTHROPIC_API_KEY?.trim();
    if (!chave) throw new ProviderError('anthropic', '(sem modelo)', 'ANTHROPIC_API_KEY não está definida.');
    // `maxRetries: 0` pelo mesmo motivo do Gemini: quem repete é o runtime da
    // extensão, contado e dentro do prazo. O `timeout` corta antes do
    // `maxDuration` da rota.
    clienteReal = new Anthropic({ apiKey: chave, maxRetries: 0, timeout: 50_000 });
  }
  return clienteReal as unknown as ClienteAnthropic;
});
