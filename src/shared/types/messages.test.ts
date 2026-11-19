/**
 * O contrato de `ui/history/restore` é estrito de propósito: o background grava
 * o registro como chegou, então um campo sobrando não pode entrar no histórico
 * por essa porta. O remetente legítimo (`features/taq/lixeira.ts`) manda o
 * `MeetingRecord` inteiro; estes testes seguram os dois lados: o formato real
 * passa, e o que não é do contrato é recusado.
 */
import { describe, expect, it } from 'vitest';
import { messageSchema } from './messages';

const registro = {
  id: 'reuniao-1',
  meetingCode: 'abc-defg-hij',
  title: 'Reunião de teste',
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_600_000,
  durationSeconds: 600,
  participants: [{ name: 'Ana', isHost: true }],
  segments: [{ captionId: 'c1', speaker: 'Ana', text: 'oi', startOffsetMs: 0, endOffsetMs: 10 }],
  status: 'ready',
  metadata: { source: 'test' },
};

const restauracao = (record: Record<string, unknown>) => ({ type: 'ui/history/restore', record });

describe('ui/history/restore', () => {
  it('aceita o MeetingRecord completo, como a lixeira manda', () => {
    expect(messageSchema.safeParse(restauracao(registro)).success).toBe(true);
  });

  it('aceita registro antigo sem endedAt, durationSeconds, participants, status e metadata', () => {
    // Decisão: a lixeira devolve o registro como estava; recusar um antigo impediria a recuperação.
    const minimo = { id: 'r1', title: 't', startedAt: 1, segments: [] };
    expect(messageSchema.safeParse(restauracao(minimo)).success).toBe(true);
  });

  it('recusa campo extra dentro do registro', () => {
    expect(messageSchema.safeParse(restauracao({ ...registro, injetado: 'x' })).success).toBe(false);
  });

  it('recusa campo extra na mensagem, fora do registro', () => {
    expect(
      messageSchema.safeParse({ ...restauracao(registro), sender: 'pagina' }).success,
    ).toBe(false);
  });

  it('recusa status fora do que o histórico conhece', () => {
    expect(messageSchema.safeParse(restauracao({ ...registro, status: 'apagado' })).success).toBe(false);
  });
});
