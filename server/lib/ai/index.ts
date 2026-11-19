/**
 * Porta de entrada da camada de IA. Quem precisa de inferência chama
 * `complete(agent, req)` e nunca vê provedor, cliente ou nome de modelo.
 *
 * Trocar o provedor de um agente é editar `config.ts` ou exportar uma
 * variável de ambiente — nenhum outro arquivo muda.
 */
import { AGENT_CONFIG, type MatrixEntry } from './config';
import { estimateCost, type CostBreakdown } from './pricing';
import { anthropicProvider } from './providers/anthropic';
import { googleProvider } from './providers/google';
import { groqProvider } from './providers/groq';
import { mockProvider } from './providers/mock';
import { openaiProvider } from './providers/openai';
import { xaiProvider } from './providers/xai';
import {
  PROVIDER_IDS,
  ProviderError,
  type AgentName,
  type CompletionRequest,
  type CompletionResult,
  type JsonSchema,
  type Provider,
  type ProviderId,
} from './types';

const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  xai: xaiProvider,
  groq: groqProvider,
  mock: mockProvider,
};

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

/** Resolve o agente para o provedor+modelo configurados agora. */
export function resolveAgent(agent: AgentName): { provider: Provider; model: string } {
  const { provider, model } = AGENT_CONFIG[agent];
  return { provider: PROVIDERS[provider], model };
}

export async function complete(
  agent: AgentName,
  req: CompletionRequest,
): Promise<CompletionResult> {
  const { provider, model } = resolveAgent(agent);
  return provider.complete(model, req);
}

export interface CapabilityRow {
  provider: ProviderId;
  structuredOutput: boolean;
  contextCache: boolean;
  extendedThinking: boolean;
}

/**
 * Quem suporta o quê, no sentido de "existe controle nativo no nível da
 * requisição". Capacidade false não quer dizer que o recurso não funcione:
 * quer dizer que o adaptador degrada em código ou depende de comportamento
 * automático do provedor. Ver o comentário de topo de cada adaptador.
 */
export function capabilityTable(): CapabilityRow[] {
  return PROVIDER_IDS.map((id) => {
    const provider = PROVIDERS[id];
    return {
      provider: id,
      structuredOutput: provider.supports('structuredOutput'),
      contextCache: provider.supports('contextCache'),
      extendedThinking: provider.supports('extendedThinking'),
    };
  });
}

export {
  API_KEY_ENV_VAR,
  describeSkips,
  hasApiKey,
  planMatrixRun,
} from './availability';
export type { RunPlan, SkippedEntry, SkippedProvider } from './availability';
export {
  AGENT_CONFIG,
  COMPARISON_MATRIX,
  DEFAULT_AGENT_CONFIG,
  activeDataPolicyWarning,
  aceitaSinteticaDoCliente,
  activeProviders,
  politicaDeDadosNaoDeclarada,
  recusaPorPoliticaDeDados,
  agentConfigFor,
  cheapestProductionEntry,
  dataPolicyWarning,
  matrixEntryForModel,
  matrixFor,
  parseOverride,
  productionCandidates,
  usesContentForTraining,
} from './config';
export type { AgentModelConfig, Billing, DataPolicy, MatrixEntry, Tier } from './config';
export { PRICING, estimateCost, priceFor } from './pricing';
export type { CostBreakdown } from './pricing';
export * from './types';
