/** Transcrição de arquivo, usando a chave Groq já suportada pelo servidor. Nunca guarda a mídia. */
import { z } from 'zod';

export const LIMITE_DE_MIDIA = 4_000_000;
export const FORMATOS_DE_MIDIA = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac', 'mpeg', 'mpga'];
const respostaSchema = z.object({ segments: z.array(z.object({
  text: z.string().trim().min(1).max(200000), start: z.number().finite().min(0).max(86400),
  end: z.number().finite().min(0).max(86400),
}).refine((s) => s.end >= s.start)).min(1).max(10000) });

export async function transcreverMidia(bytes: Uint8Array<ArrayBuffer>, formato: string, sinal: AbortSignal,
  deps: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {}) {
  const env = deps.env ?? process.env;
  if (!FORMATOS_DE_MIDIA.includes(formato) || !bytes.length || bytes.length > LIMITE_DE_MIDIA)
    throw new Error('Arquivo inválido. Envie uma mídia com até 4 MB.');
  if (!env.GROQ_API_KEY?.trim()) throw new Error('A transcrição de áudio ainda não está configurada no servidor.');
  if (env.DOCCITI_DATA_POLICY !== 'private') throw new Error('A transcrição de áudio exige a política privada configurada no servidor.');
  const form = new FormData();
  form.set('file', new Blob([bytes]), `audio.${formato}`);
  form.set('model', env.DOCCITI_MODELO_TRANSCRICAO?.trim() || 'whisper-large-v3-turbo');
  form.set('response_format', 'verbose_json');
  form.set('temperature', '0');
  const resposta = await (deps.fetch ?? fetch)('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form,
    signal: AbortSignal.any([sinal, AbortSignal.timeout(45000)]),
  });
  if (!resposta.ok) throw new Error('O serviço de transcrição não conseguiu processar o arquivo. Tente novamente mais tarde.');
  const json = respostaSchema.parse(await resposta.json());
  if (json.segments.reduce((n, s) => n + s.text.length, 0) > 200000)
    throw new Error('A transcrição excedeu o limite de 200 mil caracteres.');
  return json.segments.map((s) => ({ speaker: null, text: s.text,
    startOffsetMs: Math.round(s.start * 1000), endOffsetMs: Math.round(s.end * 1000) }));
}
