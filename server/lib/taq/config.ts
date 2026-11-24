/**
 * Qual provedor e qual modelo o Taq usa — e o que falta para ele funcionar.
 *
 * ── Separado de `lib/ai/config.ts`, de propósito ────────────────────────────
 *
 * A camada de IA existente serve ao pipeline de geração (Pensante, Auditor,
 * Escritor), e tem uma regra que aqui seria errada: fora de produção, sem
 * chave, ela cai no MOCK. Para gerar documento em desenvolvimento isso é
 * conveniência; para um assistente de conversa é resposta inventada com cara de
 * resposta real. O Taq nunca cai no mock — sem chave, o estado é
 * `configuracao_pendente` e a interface diz isso antes de a pessoa escrever.
 *
 * O que É reaproveitado: o formato `provedor:modelo` (`parseOverride`), o nome
 * da variável da chave por provedor e a política de dados da chave.
 *
 * ── Três provedores ──────────────────────────────────────────────────────────
 *
 * Anthropic (`anthropic.ts`, desde 23/11/2026: `TAQ_ORQUESTRADOR=anthropic:<modelo>`;
 * o apelido `claude:` não vale no formato com modelo), Google (`gemini.ts`) e, temporariamente, Groq
 * (`groq.ts`) têm adaptador com ferramentas. Escolher outro provedor em
 * `TAQ_ORQUESTRADOR` não é erro de sintaxe: é uma pendência, dita como tal.
 *
 * O modelo padrão é o Haiku atual desde 23/11/2026 (decisão do usuário: todos
 * os agentes na Anthropic, mesma divisão de antes — o Taq ficava no
 * `gemini-3.5-flash`). Validado ao vivo: 9 de 9 jornadas de trabalho.
 */
import { API_KEY_ENV_VAR } from '@/lib/ai/availability';
import { parseOverride, politicaDeDadosNaoDeclarada } from '@/lib/ai/config';
import type { ProviderId } from '@/lib/ai/types';
import type { EstadoDoTaq } from './contrato';
import { VERSAO_DAS_INSTRUCOES } from './instrucoes';

export const VARIAVEL_DO_MODELO = 'TAQ_ORQUESTRADOR';
export const PADRAO = 'anthropic:claude-haiku-5-5';

/**
 * `groq` é do Taq só, e temporário (ver `groq.ts`): não é um `ProviderId` do
 * pipeline, então é lido aqui antes de `parseOverride`.
 */
export type ProvedorDoTaq = ProviderId | 'groq';

/** Provedores com adaptador de ferramentas implementado, e a variável da chave de cada um. */
const CHAVE_DO_ADAPTADOR: Partial<Record<ProvedorDoTaq, string>> = {
  anthropic: API_KEY_ENV_VAR.anthropic,
  google: API_KEY_ENV_VAR.google,
  groq: 'GROQ_API_KEY',
};

export interface ConfiguracaoDoTaq {
  buscaNaInternet: EstadoDoTaq['buscaNaInternet'];
  provedor: ProvedorDoTaq | null;
  modelo: string | null;
  politicaDeDados: 'private' | 'training';
  pendencias: string[];
}

/** Pura sobre `env`: é o que deixa os testes dizerem qualquer cenário. */
export function resolverConfiguracao(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDoTaq {
  const politicaDeDados = env.DOCCITI_DATA_POLICY?.trim() === 'training' ? 'training' : 'private';
  const bruto = env[VARIAVEL_DO_MODELO]?.trim() || PADRAO;

  let provedor: ProvedorDoTaq;
  let modelo: string;
  try {
    if (bruto.startsWith('groq:')) {
      provedor = 'groq';
      modelo = bruto.slice('groq:'.length).trim();
      if (!modelo) throw new Error(`${VARIAVEL_DO_MODELO}="${bruto}": o modelo está vazio.`);
    } else {
      ({ provider: provedor, model: modelo } = parseOverride(bruto, VARIAVEL_DO_MODELO));
    }
  } catch (error) {
    return {
      buscaNaInternet: { disponivel: false, motivo: 'A configuração de IA precisa ser corrigida.' },
      provedor: null,
      modelo: null,
      politicaDeDados,
      pendencias: [(error as Error).message],
    };
  }

  const pendencias: string[] = [];
  const naoDeclarada = politicaDeDadosNaoDeclarada(env);
  if (naoDeclarada) pendencias.push(naoDeclarada);
  const variavel = CHAVE_DO_ADAPTADOR[provedor];
  if (!variavel) {
    pendencias.push(
      `O provedor "${provedor}" ainda não tem adaptador com ferramentas para o Taq. ` +
        `Use ${VARIAVEL_DO_MODELO}=anthropic:<modelo>, google:<modelo> ou groq:<modelo>.`,
    );
  } else {
    if (!env[variavel]?.trim()) {
      pendencias.push(`Falta ${variavel} no servidor (server/.env.local ou variáveis da Vercel).`);
    }
  }
  let motivo = '';
  if (env.TAQ_BUSCA_NA_INTERNET !== 'ligada') motivo = 'Busca pausada no servidor para evitar custos.';
  else if (pendencias.length || politicaDeDados !== 'private') motivo = 'A busca aguarda uma chave de IA compatível com os dados do TaqCiti.';
  else if (provedor !== 'google' || !/^gemini-3[.-]/.test(modelo)) motivo = 'O modelo configurado ainda não tem busca integrada no TaqCiti.';
  return { provedor, modelo, politicaDeDados, pendencias, buscaNaInternet: { disponivel: !motivo, motivo } };
}

export function estadoPublico(config: ConfiguracaoDoTaq): EstadoDoTaq {
  return {
    pronto: config.pendencias.length === 0,
    buscaNaInternet: config.buscaNaInternet,
    provedor: config.provedor,
    modelo: config.modelo,
    instrucoesVersao: VERSAO_DAS_INSTRUCOES,
    politicaDeDados: config.politicaDeDados,
    pendencias: config.pendencias,
  };
}
