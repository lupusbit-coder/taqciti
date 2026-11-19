/** Fila local durável. Uma chamada por execução, sem efeitos externos nem repetição automática de falhas. */
import { z } from 'zod';
import { readLocal, writeLocal, onLocalChange } from '@/shared/services/storage';
import { comTravaLocal } from '@/shared/services/storageLock';
import { listHistory } from '@/background/history';
import { guardarDocumentoUnico } from '@/features/documents/store';
import { registrarCompromissos, type NovoCompromisso } from '@/features/trabalho/store';
import { criarAdaptadorHttp, type AdaptadorDeModelo } from '@/features/taq/modelo';
import { STORAGE_KEYS } from '@/shared/config/constants';
import type { MeetingRecord } from '@/shared/types/domain';

export const CHAVE_AUTOMACOES = 'taqciti:automacoes:v1';
const CHAVE_FILA = 'taqciti:automacoes:fila:v1';
export interface PreferenciasDeAutomacao { resumo: boolean; compromissos: boolean }
export interface ExecucaoAutomatica {
  id: string; reuniaoId: string; titulo: string; fim: number; assinatura: string;
  preferencias: PreferenciasDeAutomacao;
  estado: 'pendente' | 'executando' | 'concluida' | 'falhou' | 'cancelada';
  mensagem?: string;
}
export async function lerPreferencias(): Promise<PreferenciasDeAutomacao> {
  const p = await readLocal<PreferenciasDeAutomacao>(CHAVE_AUTOMACOES);
  return { resumo: p?.resumo === true, compromissos: p?.compromissos === true };
}
export async function salvarPreferencias(p: PreferenciasDeAutomacao): Promise<void> {
  await writeLocal(CHAVE_AUTOMACOES, p);
}
export async function lerFila(): Promise<ExecucaoAutomatica[]> {
  return (await readLocal<ExecucaoAutomatica[]>(CHAVE_FILA)) ?? [];
}
export function observarFila(cb: (fila: ExecucaoAutomatica[]) => void): () => void {
  let ativo = true; let mudou = false;
  const parar = onLocalChange<ExecucaoAutomatica[]>(CHAVE_FILA, (v) => { mudou = true; if (ativo) cb(v ?? []); });
  void lerFila().then((v) => { if (ativo && !mudou) cb(v); }).catch(() => {});
  return () => { ativo = false; parar(); };
}
async function atualizar(id: string, patch: Partial<ExecucaoAutomatica>): Promise<void> {
  await comTravaLocal(CHAVE_FILA, async () => {
    await writeLocal(CHAVE_FILA, (await lerFila()).map((e) => e.id === id ? { ...e, ...patch } : e));
  });
}
async function assinatura(r: MeetingRecord): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(r.segments));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function enfileirarAutomacao(r: MeetingRecord): Promise<void> {
  const preferencias = await lerPreferencias();
  if (r.status !== 'ready' || !r.segments.length || (!preferencias.resumo && !preferencias.compromissos)) return;
  const marca = await assinatura(r);
  const id = `${r.id}:${r.endedAt}:${marca}`;
  await comTravaLocal(CHAVE_FILA, async () => {
    const fila = await lerFila();
    if (fila.some((e) => e.id === id)) return;
    await writeLocal(CHAVE_FILA, [...fila, { id, reuniaoId: r.id, titulo: r.title, fim: r.endedAt,
      assinatura: marca, preferencias, estado: 'pendente' } satisfies ExecucaoAutomatica]);
  });
}
export async function tentarAutomacaoNovamente(id: string): Promise<void> {
  await comTravaLocal(CHAVE_FILA, async () => {
    const fila = await lerFila();
    await writeLocal(CHAVE_FILA, fila.map((e) => e.id === id && e.estado === 'falhou'
      ? { ...e, estado: 'pendente', mensagem: undefined } : e));
  });
}
const resultadoSchema = z.object({
  resumo: z.string().max(20000),
  compromissos: z.array(z.object({
    descricao: z.string().trim().min(1).max(1000),
    segmento: z.number().int().min(0), trecho: z.string().trim().min(1).max(2000),
    responsavel: z.string().max(200).nullable(), prazo: z.string().max(200).nullable(),
  })).max(3),
});

async function mesmaFonte(e: ExecucaoAutomatica): Promise<MeetingRecord | undefined> {
  const r = (await listHistory()).find((r) => r.id === e.reuniaoId);
  return r?.status === 'ready' && r.endedAt === e.fim && await assinatura(r) === e.assinatura ? r : undefined;
}

export async function processarAutomacoes(modelo: AdaptadorDeModelo = criarAdaptadorHttp({ interativo: false })): Promise<void> {
  await comTravaLocal('automacoes:processamento', async () => {
    for (const e of await lerFila()) {
      if (e.estado === 'executando') {
        await atualizar(e.id, { estado: 'falhou', mensagem: 'Execução interrompida. Você pode tentar novamente.' });
        continue;
      }
      if (e.estado !== 'pendente') continue;
      try {
        const r = await mesmaFonte(e);
        const p = await lerPreferencias();
        const resumo = e.preferencias.resumo && p.resumo;
        const compromissos = e.preferencias.compromissos && p.compromissos;
        if (!r || (!resumo && !compromissos)) {
          await atualizar(e.id, { estado: 'cancelada', mensagem: 'Fonte alterada ou automação desativada.' }); continue;
        }
        const contexto = JSON.stringify({ titulo: r.title, resumo, compromissos,
          falas: r.segments.map((s, i) => ({ indice: i, pessoa: s.speaker, texto: s.text })) });
        if (contexto.length > 150000) throw new Error('Esta transcrição excede o limite de 150 mil caracteres da automação.');
        await atualizar(e.id, { estado: 'executando', mensagem: undefined });
        const resposta = await modelo.turno({ instrucoes: 'automacoes-v1', contexto,
          mensagens: [{ papel: 'pessoa', texto: 'Produza somente os resultados solicitados no contexto.' }],
          ferramentas: [], maxTokensDeSaida: 4096 }, AbortSignal.timeout(25000));
        if (resposta.tipo !== 'final' || resposta.chamadas.length) throw new Error('A IA não concluiu a automação. Tente novamente mais tarde.');
        let resultado: z.infer<typeof resultadoSchema>;
        try { resultado = resultadoSchema.parse(JSON.parse(resposta.texto)); }
        catch { throw new Error('A IA devolveu um resultado incompleto. Tente novamente mais tarde.'); }
        if (resumo && !resultado.resumo.trim()) throw new Error('A IA não devolveu o resumo.');
        const novos: NovoCompromisso[] = compromissos ? resultado.compromissos.map((c) => {
          const s = r.segments[c.segmento];
          if (!s || !s.text.includes(c.trecho)) throw new Error('Os próximos passos não têm evidência válida na transcrição.');
          return { descricao: c.descricao, situacao: 'candidato', reuniaoId: r.id,
            responsavel: c.responsavel && (c.responsavel === s.speaker || c.trecho.includes(c.responsavel))
              ? { nome: c.responsavel, confirmado: false } : null,
            prazo: c.prazo && c.trecho.includes(c.prazo) ? { texto: c.prazo } : null,
            evidencias: [{ tipo: 'reuniao', registroId: r.id, titulo: r.title,
              versao: `${r.endedAt}:${r.segments.length}`, trecho: c.trecho, segmento: c.segmento, offsetMs: s.startOffsetMs }] };
        }) : [];
        // Serializa com edição/exclusão: uma resposta tardia não recria vínculos apagados.
        await comTravaLocal('automacoes:gravar', () => comTravaLocal(STORAGE_KEYS.history, async () => {
          const atual = await mesmaFonte(e);
          const permitidas = await lerPreferencias();
          if (!atual || (!permitidas.resumo && !permitidas.compromissos)) {
            await atualizar(e.id, { estado: 'cancelada' }); return;
          }
          if (resumo && permitidas.resumo) await guardarDocumentoUnico({ title: `Resumo — ${atual.title}`,
            content: resultado.resumo, meetingId: r.id, formato: 'markdown', tipo: 'resumo', origem: 'gerado' },
          { execucaoId: e.id, chave: `automacao:resumo:${e.id}` });
          const tarefas = permitidas.compromissos && novos.length
            ? await registrarCompromissos(novos, { origem: 'taq', execucaoId: e.id }) : null;
          await atualizar(e.id, { estado: 'concluida', mensagem: tarefas?.recusadosPorLimite.length
            ? 'Resumo processado. Alguns próximos passos não foram adicionados: a reunião já atingiu o limite de acompanhamento.' : undefined });
        }));
      } catch (erro) {
        await atualizar(e.id, { estado: 'falhou', mensagem: erro instanceof Error ? erro.message : 'Não foi possível executar a automação.' });
      }
    }
  });
}

/** Alarme retoma pendências quando o navegador abre; nunca executa com ele fechado. */
export function ligarAutomacoes(pronto: Promise<void> = Promise.resolve()): void {
  let rodando = false;
  const executar = () => {
    if (rodando) return;
    rodando = true;
    void pronto.then(() => processarAutomacoes()).catch(() => {}).finally(() => { rodando = false; });
  };
  chrome.alarms.onAlarm.addListener((alarme) => { if (alarme.name === CHAVE_FILA) executar(); });
  void chrome.alarms.create(CHAVE_FILA, { periodInMinutes: 1 });
  onLocalChange<ExecucaoAutomatica[]>(CHAVE_FILA, (fila) => { if (fila?.some((e) => e.estado === 'pendente')) executar(); });
  executar();
}
