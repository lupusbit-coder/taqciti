/**
 * A saída estruturada da Anthropic exige `additionalProperties: false` em todo
 * objeto (400 na primeira execução real, 23/11/2026). O schema é compartilhado
 * com os outros provedores, então o ajuste é uma CÓPIA, feita só no adaptador.
 */
import { describe, expect, it } from 'vitest';
import { schemaParaAnthropic } from './anthropic';

describe('schemaParaAnthropic', () => {
  it('fecha todo objeto, inclusive aninhado e dentro de array, sem mexer no original', () => {
    const original = {
      type: 'object',
      properties: {
        itens: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } },
        meta: { type: ['object', 'null'], properties: {} },
      },
    };
    const r = schemaParaAnthropic(original) as typeof original & { additionalProperties: boolean };
    expect(r.additionalProperties).toBe(false);
    expect((r.properties.itens.items as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    expect((r.properties.meta as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    expect((original as { additionalProperties?: boolean }).additionalProperties).toBeUndefined();
  });

  it('não sobrescreve um additionalProperties já declarado', () => {
    const r = schemaParaAnthropic({ type: 'object', additionalProperties: { type: 'string' } }) as Record<string, unknown>;
    expect(r.additionalProperties).toEqual({ type: 'string' });
  });
});
