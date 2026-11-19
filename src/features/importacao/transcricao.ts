/** Arquivos externos viram registros locais; tempos desconhecidos não são inventados. */
import { z } from 'zod';
import type { LiveSegment, MeetingRecord } from '@/shared/types/domain';

export const segmentoImportadoSchema = z.object({
  speaker: z.string().max(200).nullable(), text: z.string().trim().min(1).max(200000),
  startOffsetMs: z.number().finite().min(0).max(86400000),
  endOffsetMs: z.number().finite().min(0).max(86400000),
}).refine((s) => s.endOffsetMs >= s.startOffsetMs);
export const importacaoSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  iniciadaEm: z.number().finite().min(0),
  nome: z.string().min(1).max(255),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  formato: z.enum(['txt', 'vtt', 'srt', 'midia']),
  segmentos: z.array(segmentoImportadoSchema).min(1).max(10000),
}).refine((p) => p.segmentos.reduce((n, s) => n + s.text.length, 0) <= 200000);
export type Importacao = z.infer<typeof importacaoSchema>;

function tempo(valor: string): number {
  const partes = valor.replace(',', '.').split(':').map(Number);
  const segundos = partes.pop()!;
  const minutos = partes.pop()!;
  const horas = partes.pop() ?? 0;
  if (![segundos, minutos, horas].every(Number.isFinite) || segundos >= 60 || minutos >= 60)
    throw new Error('Há um horário inválido na transcrição.');
  return Math.round((horas * 3600 + minutos * 60 + segundos) * 1000);
}

export function lerTranscricao(texto: string, formato: 'txt' | 'vtt' | 'srt'): LiveSegment[] {
  const limpo = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!limpo || limpo.includes('\u0000') || limpo.length > 200000)
    throw new Error('Escolha uma transcrição de texto com até 200 mil caracteres.');
  const falas: LiveSegment[] = [];
  const adicionar = (text: string, startOffsetMs = 0, endOffsetMs = startOffsetMs, speaker: string | null = null) => {
    if (text.trim()) falas.push({ captionId: `importado-${falas.length}`, text: text.trim(), speaker, startOffsetMs, endOffsetMs });
  };
  if (formato === 'txt') {
    for (const linha of limpo.split('\n')) {
      const marcada = linha.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)$/);
      if (marcada) adicionar(marcada[3]!, tempo(marcada[1]!), undefined, marcada[2]!.trim());
      else adicionar(linha, falas.at(-1)?.startOffsetMs ?? 0, undefined, falas.at(-1)?.speaker ?? null);
    }
  } else {
    for (const bloco of limpo.split(/\n\s*\n/)) {
      if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(bloco)) continue;
      const linhas = bloco.split('\n');
      const indice = linhas.findIndex((l) => l.includes('-->'));
      if (indice < 0) throw new Error('Há um bloco sem horários válidos na legenda.');
      const horario = linhas[indice]!.match(/^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})(?:\s.*)?$/);
      if (!horario) throw new Error('Não foi possível ler os horários da legenda.');
      const conteudo = linhas.slice(indice + 1).join('\n');
      const voz = conteudo.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>/);
      const text = conteudo.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
      const inicio = tempo(horario[1]!); const fim = tempo(horario[2]!);
      if (fim < inicio) throw new Error('A legenda tem um trecho que termina antes de começar.');
      adicionar(text, inicio, fim, voz?.[1]?.trim() ?? null);
    }
  }
  if (!falas.length || falas.length > 10000) throw new Error('A transcrição está vazia ou tem mais de 10 mil trechos.');
  return falas;
}

export function registroImportado(dados: Importacao): MeetingRecord {
  const duracao = Math.max(...dados.segmentos.map((s) => s.endOffsetMs));
  return {
    id: `importado-${dados.hash}`, title: dados.titulo, startedAt: dados.iniciadaEm,
    endedAt: dados.iniciadaEm + duracao, durationSeconds: Math.ceil(duracao / 1000),
    participants: [], status: 'ready',
    segments: dados.segmentos.map((s, i) => ({ ...s, captionId: `importado-${i}` })),
    importacao: { nome: dados.nome, formato: dados.formato, hash: dados.hash, importadaEm: Date.now() },
    metadata: { capturedCaptions: false, droppedSegments: 0, reconnectCount: 0, wasDiscardedAndRestarted: false },
  };
}
