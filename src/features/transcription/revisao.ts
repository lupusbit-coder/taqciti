/** Uma tentativa após salvar o original. Falhas nunca impedem o encerramento. */
import { z } from 'zod/v4';
import { criarAdaptadorHttp, type AdaptadorDeModelo } from '@/features/taq/modelo';
import type { MeetingRecord } from '@/shared/types/domain';
import { guardarRevisao } from '@/background/history';

const respostaSchema = z.object({
  falas: z.array(z.object({ id: z.string(), texto: z.string().trim().min(1) })),
});

export async function revisarTranscricao(
  original: MeetingRecord,
  modelo: AdaptadorDeModelo = criarAdaptadorHttp({ interativo: false }),
): Promise<void> {
  try {
    if (original.revisao || original.status !== 'ready' || !original.segments.length)
      return;
    const contexto = JSON.stringify(
      original.segments.map((s) => ({
        id: s.captionId,
        pessoa: s.speaker,
        texto: s.text,
      })),
    );
    // Uma chamada integral; não enviar recortes que perderiam o contexto.
    // Mesmo teto de contexto do servidor. Se a saída exceder 8192 tokens,
    // o resultado truncado é descartado inteiro, sem revisão parcial.
    if (contexto.length > 40000) return;
    const resposta = await modelo.turno(
      {
        instrucoes: 'transcricao-v1',
        contexto,
        mensagens: [
          { papel: 'pessoa', texto: 'Revise a transcrição e devolva o JSON completo.' },
        ],
        ferramentas: [],
        maxTokensDeSaida: 8192,
      },
      AbortSignal.timeout(25000),
    );
    if (resposta.tipo !== 'final' || resposta.chamadas.length) return;
    const revisada = respostaSchema.parse(JSON.parse(resposta.texto));
    if (revisada.falas.length !== original.segments.length) return;
    if (revisada.falas.some((f, i) => f.id !== original.segments[i]?.captionId)) return;
    await guardarRevisao(original, {
      segmentos: original.segments.map((s, i) => ({
        ...s,
        text: revisada.falas[i]!.texto,
      })),
      revisadaEm: Date.now(),
    });
  } catch {
    // Sem correção heurística, retries, notificações ou alteração do original.
  }
}
