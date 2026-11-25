/**
 * Repositório do histórico de reuniões em chrome.storage.local — a fonte da
 * verdade das transcrições. Registros ordenados do mais recente para o mais
 * antigo, sem descarte automático de reuniões e seus vínculos. Statuses de eras anteriores da extensão
 * ("pending", "ignored", "discarded", "sent") são normalizados para "ready"
 * na leitura: nenhuma transcrição antiga se perde na migração.
 */
import type { HistoryStatus, MeetingRecord } from '@/shared/types/domain';
import { STORAGE_KEYS } from '@/shared/config/constants';
import { comTravaLocal } from '@/shared/services/storageLock';
import { readLocal, writeLocal } from '@/shared/services/storage';

const VALID_STATUSES: readonly HistoryStatus[] = ['recording', 'ready'];

/** A resposta tardia não ressuscita registro apagado nem revisa outra captura. */
export async function guardarRevisao(original: MeetingRecord, revisao: NonNullable<MeetingRecord['revisao']>): Promise<void> {
  await comTravaLocal(STORAGE_KEYS.history, async () => {
    const history = await listHistory();
    const atual = history.find((r) => r.id === original.id);
    if (!atual || atual.status !== 'ready' || atual.revisao ||
        atual.endedAt !== original.endedAt ||
        JSON.stringify(atual.segments) !== JSON.stringify(original.segments)) return;
    await writeLocal(STORAGE_KEYS.history, history.map((r) => r.id === original.id ? { ...r, revisao } : r));
  });
}

function normalizeRecord(record: MeetingRecord): MeetingRecord {
  if ((VALID_STATUSES as readonly string[]).includes(record.status)) return record;
  return { ...record, status: 'ready' };
}

export async function listHistory(): Promise<MeetingRecord[]> {
  const raw = (await readLocal<MeetingRecord[]>(STORAGE_KEYS.history)) ?? [];
  return raw.map(normalizeRecord);
}

export async function upsertRecord(record: MeetingRecord): Promise<void> {
  return comTravaLocal(STORAGE_KEYS.history, async () => {
    const history = await listHistory();
    const previous = history.find((item) => item.id === record.id);
    const merged = previous ? { ...previous, ...record } : record;
    if (previous && (record.status === 'recording' ||
        JSON.stringify(previous.segments) !== JSON.stringify(record.segments))) delete merged.revisao;
    const without = history.filter((r) => r.id !== record.id);
    const next = [merged, ...without].sort((a, b) => b.startedAt - a.startedAt);
    await writeLocal(STORAGE_KEYS.history, next);
  });
}

export async function patchRecord(
  id: string,
  patch: Partial<Pick<MeetingRecord, 'title' | 'status'>>,
): Promise<void> {
  return comTravaLocal(STORAGE_KEYS.history, async () => {
    const history = await listHistory();
    const next = history.map((r) => (r.id === id ? { ...r, ...patch } : r));
    await writeLocal(STORAGE_KEYS.history, next);
  });
}

/**
 * Registros presos em "recording" que não são a sessão viva (navegador caiu
 * no meio da reunião) viram "ready": a transcrição capturada até a queda
 * fica disponível no histórico — nada se perde.
 */
export async function finalizeStaleRecordings(
  liveMeetingId: string | null,
): Promise<void> {
  return comTravaLocal(STORAGE_KEYS.history, async () => {
    const history = await listHistory();
    let changed = false;
    const next = history.map((r) => {
      if (r.status === 'recording' && r.id !== liveMeetingId) {
        changed = true;
        return { ...r, status: 'ready' as const };
      }
      return r;
    });
    if (changed) await writeLocal(STORAGE_KEYS.history, next);
  });
}
