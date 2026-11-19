/** Cobre custos, idempotência e resposta tardia — os riscos do trabalho fora da captura. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { installChromeStorageMock } from '@/test/chromeStorageMock';
import { registroImportado, lerTranscricao } from '@/features/importacao/transcricao';
import { upsertRecord, listHistory } from '@/background/history';
import { limparVinculosDaReuniao } from '@/features/annotations/vinculos';
import { lerDocumentos } from '@/features/documents/store';
import { lerTrabalho } from '@/features/trabalho/store';
import type { RespostaDoTurno } from '@/features/taq/modelo';
import { enfileirarAutomacao, lerFila, processarAutomacoes, salvarPreferencias, tentarAutomacaoNovamente } from './automacoes';

const r = registroImportado({ titulo: 'Teste sintético', iniciadaEm: 1000, nome: 'teste.txt', hash: 'd'.repeat(64), formato: 'txt',
  segmentos: lerTranscricao('Ana vai revisar a API amanhã.', 'txt') });
const resultado = (trecho = 'Ana vai revisar a API amanhã.') => ({ tipo: 'final', chamadas: [], texto: JSON.stringify({
  resumo: 'Foi combinada a revisão da API.', compromissos: [{ descricao: 'Revisar a API', segmento: 0, trecho, responsavel: 'Ana', prazo: 'amanhã' }],
}) }) as unknown as RespostaDoTurno;

describe('automações pós-reunião', () => {
  beforeEach(async () => { installChromeStorageMock(); vi.stubGlobal('crypto', webcrypto); await upsertRecord(structuredClone(r)); });
  afterEach(() => vi.unstubAllGlobals());
  it('não chama IA sem preferência e não altera a transcrição original', async () => {
    const turno = vi.fn(); await enfileirarAutomacao(r); await processarAutomacoes({ turno });
    expect(turno).not.toHaveBeenCalled(); expect((await listHistory())[0]?.segments).toEqual(r.segments);
  });
  it('executa uma vez, salva resumo e candidatos com evidência e não duplica ao repetir', async () => {
    await salvarPreferencias({ resumo: true, compromissos: true });
    const turno = vi.fn().mockResolvedValue(resultado());
    await Promise.all([enfileirarAutomacao(r), enfileirarAutomacao(r)]);
    await processarAutomacoes({ turno }); await enfileirarAutomacao(r); await processarAutomacoes({ turno });
    expect(turno).toHaveBeenCalledTimes(1); expect(await lerDocumentos()).toHaveLength(1);
    const tarefas = (await lerTrabalho()).compromissos;
    expect(tarefas).toHaveLength(1); expect(tarefas[0]).toMatchObject({ situacao: 'candidato', responsavel: { nome: 'Ana', confirmado: false } });
    expect((await lerFila())[0]?.estado).toBe('concluida');
  });
  it('recusa evidência inventada sem gravar resultado parcial', async () => {
    await salvarPreferencias({ resumo: true, compromissos: true }); await enfileirarAutomacao(r);
    await processarAutomacoes({ turno: vi.fn().mockResolvedValue(resultado('Fala inventada')) });
    expect(await lerDocumentos()).toHaveLength(0); expect((await lerTrabalho()).compromissos).toHaveLength(0);
    expect((await lerFila())[0]?.estado).toBe('falhou');
  });
  it('falha não dispara tentativas infinitas; tentativa explícita pode recuperar', async () => {
    await salvarPreferencias({ resumo: true, compromissos: false }); await enfileirarAutomacao(r);
    const turno = vi.fn().mockRejectedValueOnce(new Error('Sem conexão')).mockResolvedValue(resultado());
    await processarAutomacoes({ turno }); await processarAutomacoes({ turno }); expect(turno).toHaveBeenCalledTimes(1);
    await tentarAutomacaoNovamente((await lerFila())[0]!.id); await processarAutomacoes({ turno });
    expect(turno).toHaveBeenCalledTimes(2); expect(await lerDocumentos()).toHaveLength(1);
  });
  it('não recria conteúdo se a reunião é apagada enquanto a IA responde', async () => {
    await salvarPreferencias({ resumo: true, compromissos: true }); await enfileirarAutomacao(r);
    await processarAutomacoes({ turno: vi.fn(async () => { await limparVinculosDaReuniao(r.id); return resultado(); }) });
    expect(await lerDocumentos()).toHaveLength(0); expect(await listHistory()).toHaveLength(0);
    expect((await lerFila())[0]?.estado).toBe('cancelada');
  });
  it('cancela pendências desativadas e fonte retomada, antes da IA', async () => {
    await salvarPreferencias({ resumo: true, compromissos: false }); await enfileirarAutomacao(r);
    await upsertRecord({ ...r, status: 'recording' }); const turno = vi.fn(); await processarAutomacoes({ turno });
    expect(turno).not.toHaveBeenCalled(); expect((await lerFila())[0]?.estado).toBe('cancelada');
  });
});
