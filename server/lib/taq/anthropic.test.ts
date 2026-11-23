/**
 * O adaptador de turno da Anthropic, com cliente falso (sem rede).
 *
 * O que fica fixado aqui são as regras que, quebradas, dão 400 no provedor ou
 * resposta errada sem erro:
 *   - o raciocínio volta INTACTO no turno seguinte (via `continuacao`);
 *   - depois de um fallback, o que veio antes do último bloco `fallback` volta só
 *     como texto, e a ferramenta pedida antes dele não chega à extensão;
 *   - sem `tool_choice` forçado, sem `temperature`, e o `effort` só onde é aceito.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { OverloadedError, RateLimitError } from '@/lib/ai/types';
import { blocosParaVoltar, criarAdaptadorAnthropic, paraMensagens, type ClienteAnthropic } from './anthropic';
import type { PedidoAoAdaptador } from './gemini';

const PEDIDO: PedidoAoAdaptador = {
  sistema: 'Você é o Taq.',
  contexto: '[CONTEXTO] reunião sintética',
  mensagens: [{ papel: 'pessoa', texto: 'Quais os próximos passos?' }],
  ferramentas: [
    { nome: 'listar_reunioes', descricao: 'Lista reuniões.', parametros: { type: 'object', properties: {} } },
  ],
  maxTokensDeSaida: 1024,
};

function mensagem(conteudo: unknown[], extra: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: conteudo,
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
    ...extra,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function adaptadorCom(resposta: Anthropic.Beta.BetaMessage | Error) {
  const create = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const cliente = { beta: { messages: { create } } } as unknown as ClienteAnthropic;
  return { adaptador: criarAdaptadorAnthropic(() => cliente), create };
}

describe('paraMensagens', () => {
  it('o contexto entra como bloco próprio na primeira mensagem da pessoa', () => {
    const m = paraMensagens('[CONTEXTO]', [
      { papel: 'pessoa', texto: 'oi' },
      { papel: 'pessoa', texto: 'de novo' },
    ]);
    expect(m[0]).toEqual({ role: 'user', content: [{ type: 'text', text: '[CONTEXTO]' }, { type: 'text', text: 'oi' }] });
    expect(m[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'de novo' }] });
  });

  it('a continuação volta sem mudar nada, com o raciocínio e a assinatura', () => {
    const blocos = [
      { type: 'thinking', thinking: '', signature: 'assinatura-opaca' },
      { type: 'tool_use', id: 'toolu_1', name: 'listar_reunioes', input: {} },
    ];
    const m = paraMensagens('', [
      { papel: 'pessoa', texto: 'oi' },
      { papel: 'modelo', chamadas: [], continuacao: JSON.stringify(blocos) },
      { papel: 'ferramenta', resultados: [{ chamadaId: 'toolu_1', nome: 'listar_reunioes', conteudo: { reunioes: [] } }] },
    ]);
    expect(m[1]).toEqual({ role: 'assistant', content: blocos });
    expect(m[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"reunioes":[]}' }],
    });
  });

  it('resultado com erro vai marcado como erro da ferramenta', () => {
    const m = paraMensagens('', [
      { papel: 'pessoa', texto: 'oi' },
      { papel: 'ferramenta', resultados: [{ chamadaId: 't', nome: 'listar_reunioes', conteudo: { erro: 'sem acesso' } }] },
    ]);
    expect((m[1]!.content as Array<{ is_error?: boolean }>)[0]!.is_error).toBe(true);
  });

  it('continuação com bloco desconhecido é recusada, não repassada', () => {
    expect(() =>
      paraMensagens('', [
        { papel: 'pessoa', texto: 'oi' },
        { papel: 'modelo', chamadas: [], continuacao: JSON.stringify([{ type: 'server_tool_use', id: 'x' }]) },
      ]),
    ).toThrow(/não aceito/);
  });
});

describe('blocosParaVoltar — a regra do fallback', () => {
  it('antes do último fallback só o texto volta; o bloco fallback fica no lugar', () => {
    const conteudo = [
      { type: 'thinking', thinking: '', signature: 's1' },
      { type: 'text', text: 'Começando… ' },
      { type: 'tool_use', id: 'toolu_antes', name: 'listar_reunioes', input: {} },
      { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
      { type: 'thinking', thinking: '', signature: 's2' },
      { type: 'tool_use', id: 'toolu_depois', name: 'listar_reunioes', input: {} },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    const voltam = blocosParaVoltar(conteudo);
    expect(voltam.map((b) => b.type)).toEqual(['text', 'fallback', 'thinking', 'tool_use']);
    expect(voltam.some((b) => (b as { id?: string }).id === 'toolu_antes')).toBe(false);
  });
});

describe('criarAdaptadorAnthropic', () => {
  it('pede ferramentas sem forçar escolha, com cache no sistema, esforço baixo e fallback', async () => {
    const { adaptador, create } = adaptadorCom(mensagem([{ type: 'text', text: 'Pronto.' }]));
    await adaptador.executar('claude-opus-5-5', PEDIDO);
    const params = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params.tool_choice).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.thinking).toBeUndefined();
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.system).toEqual([{ type: 'text', text: 'Você é o Taq.', cache_control: { type: 'ephemeral' } }]);
    expect(params.tools).toEqual([
      { name: 'listar_reunioes', description: 'Lista reuniões.', input_schema: { type: 'object', properties: {} } },
    ]);
    // O raciocínio conta dentro de max_tokens: a folga evita cortar a resposta.
    expect(params.max_tokens).toBeGreaterThan(PEDIDO.maxTokensDeSaida);
  });

  it('Haiku 4.5 não recebe effort nem fallback (seria 400)', async () => {
    const { adaptador, create } = adaptadorCom(mensagem([{ type: 'text', text: 'ok' }]));
    await adaptador.executar('claude-haiku-4-5', PEDIDO);
    const params = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params.output_config).toBeUndefined();
    expect(params.fallbacks).toBeUndefined();
  });

  it('pedido de ferramenta vira chamadas e uma continuação com o raciocínio', async () => {
    const { adaptador } = adaptadorCom(
      mensagem(
        [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'tool_use', id: 'toolu_9', name: 'listar_reunioes', input: { limite: 3 } },
        ],
        { stop_reason: 'tool_use' },
      ),
    );
    const r = await adaptador.executar('claude-opus-5-5', PEDIDO);
    expect(r.tipo).toBe('ferramentas');
    expect(r.chamadas).toEqual([{ id: 'toolu_9', nome: 'listar_reunioes', argumentos: { limite: 3 } }]);
    expect(JSON.parse(r.continuacao!)[0]).toMatchObject({ type: 'thinking', signature: 'sig' });
    // Entrada inteira = sem cache + lido do cache + escrito no cache.
    expect(r.uso).toEqual({ entrada: 160, saida: 20, cache: 50 });
  });

  it('teto de tokens sem ferramenta é truncado', async () => {
    const { adaptador } = adaptadorCom(mensagem([{ type: 'text', text: 'parcial' }], { stop_reason: 'max_tokens' }));
    expect((await adaptador.executar('claude-opus-5-5', PEDIDO)).tipo).toBe('truncado');
  });

  it('recusa de toda a cadeia vira falha do provedor, não texto vazio', async () => {
    const { adaptador } = adaptadorCom(mensagem([], { stop_reason: 'refusal' }));
    await expect(adaptador.executar('claude-opus-5-5', PEDIDO)).rejects.toThrow(/recusado/);
  });

  it('429 vira limite com espera; 529 vira sobrecarga', async () => {
    const cota = new Anthropic.RateLimitError(429, { type: 'error' }, 'rate limited', new Headers({ 'retry-after': '7' }));
    await expect(adaptadorCom(cota).adaptador.executar('claude-opus-5-5', PEDIDO)).rejects.toBeInstanceOf(RateLimitError);
    const sobrecarga = new Anthropic.InternalServerError(529, { type: 'overloaded_error' }, 'overloaded', new Headers());
    await expect(adaptadorCom(sobrecarga).adaptador.executar('claude-opus-5-5', PEDIDO)).rejects.toBeInstanceOf(
      OverloadedError,
    );
  });
});
