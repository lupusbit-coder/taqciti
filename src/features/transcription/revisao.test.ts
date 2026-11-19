import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeStorageMock } from '@/test/chromeStorageMock';
import { listHistory, upsertRecord } from '@/background/history';
import { STORAGE_KEYS } from '@/shared/config/constants';
import type { MeetingRecord } from '@/shared/types/domain';
import type { AdaptadorDeModelo, RespostaDoTurno } from '@/features/taq/modelo';
import { revisarTranscricao } from './revisao';

const original: MeetingRecord = {
  id: 'reuniao',
  title: 'Reunião de teste',
  startedAt: 1,
  endedAt: 1000,
  durationSeconds: 1,
  participants: [],
  status: 'ready',
  segments: [
    {
      captionId: 'fala',
      speaker: 'Ana',
      text: 'nos decidiu manter API',
      startOffsetMs: 0,
      endOffsetMs: 900,
    },
  ],
  metadata: {
    capturedCaptions: true,
    droppedSegments: 0,
    reconnectCount: 0,
    wasDiscardedAndRestarted: false,
  },
};
const resposta = (
  texto = JSON.stringify({
    falas: [{ id: 'fala', texto: 'Nós decidimos manter a API.' }],
  }),
) =>
  ({
    tipo: 'final',
    texto,
    chamadas: [],
  }) as unknown as RespostaDoTurno;

describe('revisão posterior ao salvamento', () => {
  it('não envia reuniões vazias nem acima do teto de contexto do servidor', async () => {
    const turno = vi.fn();
    await revisarTranscricao({ ...original, segments: [] }, { turno });
    await revisarTranscricao({ ...original, segments: original.segments.map((s) => ({ ...s, text: 'a'.repeat(40001) })) }, { turno });
    expect(turno).not.toHaveBeenCalled();
  });
  beforeEach(() =>
    installChromeStorageMock({
      local: { [STORAGE_KEYS.history]: [structuredClone(original)] },
    }),
  );
  afterEach(() => vi.unstubAllGlobals());

  it('preserva o original, os falantes e horários e faz uma única chamada', async () => {
    const turno = vi.fn().mockResolvedValue(resposta());
    await revisarTranscricao(original, { turno });
    const [salvo] = await listHistory();
    if (!salvo) throw new Error('Original ausente');
    expect(salvo.segments).toEqual(original.segments);
    expect(salvo.revisao?.segmentos[0]).toEqual({
      ...original.segments[0],
      text: 'Nós decidimos manter a API.',
    });
    expect(turno).toHaveBeenCalledTimes(1);
    expect(turno.mock.calls[0]![0].ferramentas).toEqual([]);
    await revisarTranscricao(salvo, { turno });
    expect(turno).toHaveBeenCalledTimes(1);
  });

  it.each([
    resposta('não é JSON'),
    resposta('{"falas":[]}'),
    resposta('{"falas":[{"id":"outra","texto":"Texto"}]}'),
    { ...resposta(), tipo: 'truncado' },
  ])(
    'descarta respostas inválidas ou incompletas sem tocar o registro',
    async (resultado) => {
      await revisarTranscricao(original, { turno: vi.fn().mockResolvedValue(resultado) });
      expect(await listHistory()).toEqual([original]);
    },
  );

  it('falha de IA não altera texto nem rejeita o encerramento', async () => {
    await expect(
      revisarTranscricao(original, {
        turno: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    ).resolves.toBeUndefined();
    expect(await listHistory()).toEqual([original]);
  });

  it.each(['apagada', 'retomada', 'alterada'])(
    'ignora resultado tardio de reunião %s',
    async (caso) => {
      const modelo: AdaptadorDeModelo = {
        turno: async () => {
          if (caso === 'apagada')
            await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
          else
            await upsertRecord({
              ...original,
              status: caso === 'retomada' ? 'recording' : 'ready',
              segments: caso === 'alterada' ? [] : original.segments,
            });
          return resposta();
        },
      };
      await revisarTranscricao(original, modelo);
      expect((await listHistory())[0]?.revisao).toBeUndefined();
      if (caso === 'apagada') expect(await listHistory()).toEqual([]);
    },
  );

  it('renomear mantém a revisão; retomar invalida a revisão anterior', async () => {
    await revisarTranscricao(original, { turno: vi.fn().mockResolvedValue(resposta()) });
    await upsertRecord({ ...original, title: 'Novo título' });
    expect((await listHistory())[0]?.revisao).toBeDefined();
    await upsertRecord({ ...original, status: 'recording' });
    expect((await listHistory())[0]?.revisao).toBeUndefined();
  });
});
