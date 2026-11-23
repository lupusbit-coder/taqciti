/**
 * Adaptador Anthropic.
 *
 * Nativas usadas: saída estruturada (`output_config.format`), cache de
 * contexto explícito (`cache_control`) e raciocínio adaptativo
 * (`thinking: { type: 'adaptive' }`).
 *
 * O raciocínio adaptativo NÃO vale para todo modelo: nos modelos anteriores
 * à família 4.6 o parâmetro é `{ type: 'enabled', budget_tokens }`, e mandar
 * `adaptive` para eles é 400. Como o Auditor roda em Haiku 4.5 de propósito,
 * isso deixaria de ser detalhe teórico na primeira chamada — daí a lista
 * explícita abaixo em vez de ligar para todos.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  OverloadedError,
  ProviderError,
  RateLimitError,
  type Capability,
  type CompletionRequest,
  type Provider,
} from '../types';
import { parseRetryAfter, requireApiKey, runCompletion, type RawInvocation } from './shared';

/** Modelos que aceitam `thinking: { type: 'adaptive' }` e `output_config.effort`. */
const ADAPTIVE_THINKING_MODELS = new Set([
  // A geração atual (conferida em 23/11/2026): raciocínio sempre ligado nos
  // três primeiros, e `effort` aceito em todos.
  'claude-fable-5-2',
  'claude-mythos-5-2',
  'claude-fable-5-1',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
]);

const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-fable-5-2': 1_000_000,
  'claude-mythos-5-2': 1_000_000,
  'claude-fable-5-1': 1_000_000,
  'claude-mythos-5-1': 1_000_000,
  'claude-opus-5-5': 1_000_000,
  'claude-sonnet-5-5': 1_000_000,
  'claude-haiku-5-5': 1_000_000,
  'claude-fable-5': 1_000_000,
  'claude-mythos-5': 1_000_000,
  'claude-opus-5': 1_000_000,
  'claude-opus-4-8': 1_000_000,
  'claude-opus-4-7': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-haiku-4-5': 200_000,
};

/** Fallback conservador: errar pra baixo faz janelar demais, errar pra cima
 *  faz estourar contexto em produção. */
const FALLBACK_CONTEXT_TOKENS = 200_000;

let cached: Anthropic | undefined;

function client(): Anthropic {
  if (!cached) {
    cached = new Anthropic({
      apiKey: requireApiKey('anthropic', 'ANTHROPIC_API_KEY'),
      // O SDK repete 429 e 5xx sozinho (padrão 2). Desligado de propósito:
      // com ele, as esperas aconteceriam dentro do SDK, invisíveis, e
      // `rateLimitWaits` reportaria zero enquanto a geração leva minutos.
      // A espera vira responsabilidade de providers/shared.ts, que é a
      // mesma para os três provedores — logo, comparável.
      maxRetries: 0,
    });
  }
  return cached;
}

/** Reconhece sobrecarga — `overloaded_error` (529) e 5xx transitório. Também usado pelo Taq. */
export function asOverloaded(model: string, error: unknown): OverloadedError | undefined {
  const status = (error as { status?: unknown })?.status;
  const isOverloaded =
    error instanceof Anthropic.InternalServerError ||
    (typeof status === 'number' && status >= 500) ||
    (error as { type?: string })?.type === 'overloaded_error';
  if (!isOverloaded) return undefined;
  return new OverloadedError(
    'anthropic',
    model,
    `provedor sobrecarregado: ${(error as Error).message?.slice(0, 200) ?? ''}`,
    undefined,
    error,
  );
}

/** Reconhece 429 no formato que o SDK da Anthropic levanta. Também usado pelo Taq. */
export function asRateLimit(model: string, error: unknown): RateLimitError | undefined {
  if (!(error instanceof Anthropic.RateLimitError)) return undefined;
  const headers = (error as { headers?: unknown }).headers;
  const retryAfter =
    headers instanceof Headers
      ? headers.get('retry-after')
      : (headers as Record<string, string> | undefined)?.['retry-after'];
  return new RateLimitError(
    'anthropic',
    model,
    `cota estourada (429): ${error.message.slice(0, 200)}`,
    parseRetryAfter(retryAfter),
    error,
  );
}

/**
 * A saída estruturada da Anthropic recusa objeto sem `additionalProperties:
 * false` explícito (400 "For 'object' type, 'additionalProperties' must be
 * explicitly set to false", na primeira execução real, 23/11/2026). O schema
 * vem de `jsonSchema.ts`, compartilhado com Google e OpenAI, que não exigem;
 * por isso o ajuste é aqui, numa cópia. Exportado para teste.
 */
export function schemaParaAnthropic(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(schemaParaAnthropic);
  if (!no || typeof no !== 'object') return no;
  const copia: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(no)) copia[chave] = schemaParaAnthropic(valor);
  const ehObjeto = copia.type === 'object' || (Array.isArray(copia.type) && copia.type.includes('object'));
  if (ehObjeto && copia.additionalProperties === undefined) copia.additionalProperties = false;
  return copia;
}

function buildMessages(invocation: RawInvocation): Anthropic.MessageParam[] {
  return invocation.messages.map((message, index) => {
    const isCacheAnchor = index === 0 && invocation.cacheablePrefixLength !== undefined;
    if (!isCacheAnchor) {
      return { role: message.role, content: message.content };
    }
    // O prefixo estável vira um bloco próprio com o breakpoint de cache; o
    // resto da mensagem fica num segundo bloco, sem marcador. Marcar a
    // mensagem inteira jogaria o conteúdo volátil pra dentro do prefixo
    // cacheado e o cache nunca daria hit.
    const length = invocation.cacheablePrefixLength!;
    const prefix = message.content.slice(0, length);
    const rest = message.content.slice(length);
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: prefix, cache_control: { type: 'ephemeral' } },
    ];
    if (rest.trim()) content.push({ type: 'text', text: rest });
    return { role: message.role, content };
  });
}

export const anthropicProvider: Provider = {
  id: 'anthropic',

  supports(capability: Capability): boolean {
    switch (capability) {
      case 'structuredOutput':
        return true;
      case 'contextCache':
        // Controle explícito no nível da requisição: escolhemos onde o
        // prefixo termina, em vez de torcer pra heurística do provedor.
        return true;
      case 'extendedThinking':
        return true;
    }
  },

  maxContextTokens(model: string): number {
    return CONTEXT_WINDOWS[model] ?? FALLBACK_CONTEXT_TOKENS;
  },

  async complete(model: string, req: CompletionRequest) {
    return runCompletion('anthropic', model, req, { nativeStructuredOutput: true }, async (invocation) => {
      const supportsAdaptive = ADAPTIVE_THINKING_MODELS.has(model);

      try {
        // STREAM, não `create`: a geração pede `max_tokens` alto, e o SDK recusa
        // a chamada sem streaming ("Streaming is required for operations that may
        // take longer than 10 minutes") — visto na primeira execução real, em
        // 23/11/2026. `finalMessage()` devolve a mensagem inteira, como o `create`.
        const response = await client().messages.stream({
          model,
          max_tokens: invocation.maxTokens,
          system: invocation.system,
          messages: buildMessages(invocation),
          ...(supportsAdaptive ? { thinking: { type: 'adaptive' as const } } : {}),
          ...(invocation.jsonSchema || supportsAdaptive
            ? {
                output_config: {
                  ...(invocation.jsonSchema
                    ? {
                        format: {
                          type: 'json_schema' as const,
                          schema: schemaParaAnthropic(invocation.jsonSchema) as Record<string, unknown>,
                        },
                      }
                    : {}),
                  // `medium` é o ponto de equilíbrio custo/qualidade dos
                  // agentes deste pipeline; o harness da Fase 8 é o lugar
                  // certo pra varrer os outros níveis.
                  ...(supportsAdaptive ? { effort: 'medium' as const } : {}),
                },
              }
            : {}),
        }).finalMessage();

        if (response.stop_reason === 'refusal') {
          throw new ProviderError('anthropic', model, 'requisição recusada pelos classificadores.');
        }

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        // `input_tokens` da Anthropic EXCLUI cache; a convenção normalizada
        // (ver pricing.ts) é que `inputTokens` inclua tudo. Escrita de cache
        // entra como entrada fresca — é o que ela custa.
        const cacheRead = response.usage.cache_read_input_tokens ?? 0;
        const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;

        return {
          text,
          usage: {
            inputTokens: response.usage.input_tokens + cacheRead + cacheWrite,
            outputTokens: response.usage.output_tokens,
            cachedInputTokens: cacheRead,
          },
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        const rateLimited = asRateLimit(model, error);
        if (rateLimited) throw rateLimited;
        const overloaded = asOverloaded(model, error);
        if (overloaded) throw overloaded;
        throw new ProviderError('anthropic', model, (error as Error).message, error);
      }
    });
  },
};
