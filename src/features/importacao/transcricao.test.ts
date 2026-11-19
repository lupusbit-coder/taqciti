import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeStorageMock } from '@/test/chromeStorageMock';
import { importarRegistro, listHistory, patchRecord } from '@/background/history';
import { importacaoSchema, lerTranscricao, registroImportado } from './transcricao';

describe('importação individual', () => {
  beforeEach(() => installChromeStorageMock());
  it('preserva acentos, nomes e tempos do VTT e não inventa participantes', () => {
    const segmentos = lerTranscricao('WEBVTT\n\n00:01.000 --> 00:03.250\n<v Ana>Revisão da API &amp; decisões.</v>', 'vtt');
    expect(segmentos[0]).toMatchObject({ speaker: 'Ana', text: 'Revisão da API & decisões.', startOffsetMs: 1000, endOffsetMs: 3250 });
    const r = registroImportado({ titulo: 'Exemplo', iniciadaEm: 1000, nome: 'exemplo.vtt', hash: 'a'.repeat(64), formato: 'vtt', segmentos });
    expect(r.participants).toEqual([]);
    expect(r.endedAt).toBe(4250);
    expect(r.metadata.capturedCaptions).toBe(false);
  });
  it('lê SRT com CRLF e TXT sem fabricar duração', () => {
    expect(lerTranscricao('1\r\n00:00:01,000 --> 00:00:02,000\r\nOlá', 'srt')[0]?.endOffsetMs).toBe(2000);
    expect(lerTranscricao('Uma fala\nOutra fala', 'txt').every((s) => s.endOffsetMs === 0)).toBe(true);
    expect(lerTranscricao('[01:02] Ana: Olá\nContinuação', 'txt')[1]).toMatchObject({ speaker: 'Ana', startOffsetMs: 62000 });
  });
  it('recusa legenda malformada, horários invertidos, vazio e binário', () => {
    for (const texto of ['', '1\n00:02.000 --> 00:01.000\nOlá', '1\nhorário inválido\nOlá']) expect(() => lerTranscricao(texto, 'srt')).toThrow();
    expect(() => lerTranscricao('binário\u0000', 'txt')).toThrow();
    expect(importacaoSchema.safeParse({}).success).toBe(false);
  });
  it('duas importações concorrentes não duplicam nem sobrescrevem o nome editado', async () => {
    const r = registroImportado({ titulo: 'Original', iniciadaEm: 1000, nome: 'exemplo.txt', hash: 'b'.repeat(64), formato: 'txt', segmentos: lerTranscricao('Conteúdo', 'txt') });
    await Promise.all([importarRegistro(r), importarRegistro(r)]);
    await patchRecord(r.id, { title: 'Nome escolhido' });
    expect((await importarRegistro(r)).existente).toBe(true);
    expect(await listHistory()).toHaveLength(1);
    expect((await listHistory())[0]?.title).toBe('Nome escolhido');
  });
});
