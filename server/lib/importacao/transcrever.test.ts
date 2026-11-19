import { describe, expect, it, vi } from 'vitest';
import { transcreverMidia, LIMITE_DE_MIDIA } from './transcrever';
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', GROQ_API_KEY: 'chave-sintetica', DOCCITI_DATA_POLICY: 'private' };
describe('transcrição de mídia', () => {
  it('preserva idioma e horários sem inventar falantes e faz uma chamada', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ segments: [{ text: 'Revisão técnica.', start: 1.25, end: 3 }] }));
    const resposta = await transcreverMidia(new Uint8Array([1]), 'mp3', new AbortController().signal, { env, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(resposta).toEqual([{ text: 'Revisão técnica.', speaker: null, startOffsetMs: 1250, endOffsetMs: 3000 }]);
    const form = fetch.mock.calls[0]![1].body as FormData;
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });
  it('recusa configuração ausente, política inadequada, excesso e formato antes da rede', async () => {
    const fetch = vi.fn(); const sinal = new AbortController().signal;
    await expect(transcreverMidia(new Uint8Array([1]), 'mp3', sinal, { env: { NODE_ENV: 'test' }, fetch })).rejects.toThrow('configurada');
    await expect(transcreverMidia(new Uint8Array([1]), 'mp3', sinal, { env: { ...env, DOCCITI_DATA_POLICY: 'training' }, fetch })).rejects.toThrow('privada');
    await expect(transcreverMidia(new Uint8Array(LIMITE_DE_MIDIA + 1), 'mp3', sinal, { env, fetch })).rejects.toThrow('4 MB');
    await expect(transcreverMidia(new Uint8Array([1]), 'exe', sinal, { env, fetch })).rejects.toThrow('inválido');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('não aceita uma resposta malformada nem repete chamadas recusadas', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('segredo do provedor', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ segments: [{ text: 'Texto', start: 3, end: 1 }] }));
    await expect(transcreverMidia(new Uint8Array([1]), 'mp3', new AbortController().signal, { env, fetch })).rejects.toThrow('mais tarde');
    await expect(transcreverMidia(new Uint8Array([1]), 'mp3', new AbortController().signal, { env, fetch })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
