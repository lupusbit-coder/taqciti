import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { autorizarIa } from '@/lib/guardaDeIa';
import { transcreverMidia } from '@/lib/importacao/transcrever';
import { POST } from './route';

vi.mock('@/lib/guardaDeIa', () => ({ autorizarIa: vi.fn() }));
vi.mock('@/lib/importacao/transcrever', () => ({ LIMITE_DE_MIDIA: 4000000, FORMATOS_DE_MIDIA: ['mp3'], transcreverMidia: vi.fn() }));
describe('upload autenticado', () => {
  beforeEach(() => {
    vi.mocked(autorizarIa).mockResolvedValue({ ok: true, pessoaId: 'teste' });
    vi.mocked(transcreverMidia).mockReset();
    vi.stubEnv('GROQ_API_KEY', 'teste'); vi.stubEnv('DOCCITI_DATA_POLICY', 'private');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('não lê nem transcreve conteúdo sem autorização', async () => {
    vi.mocked(autorizarIa).mockResolvedValue({ ok: false, resposta: NextResponse.json({}, { status: 401 }) });
    const res = await POST(new NextRequest('https://exemplo.invalid/api/importacao/transcrever?formato=mp3', { method: 'POST', body: 'audio' }));
    expect(res.status).toBe(401); expect(transcreverMidia).not.toHaveBeenCalled();
  });
  it('aplica limite real mesmo sem content-length', async () => {
    const res = await POST(new NextRequest('https://exemplo.invalid/api/importacao/transcrever?formato=mp3', { method: 'POST', body: new Uint8Array(4000001) }));
    expect(res.status).toBe(413); expect(transcreverMidia).not.toHaveBeenCalled();
  });
  it('transcreve arquivo válido e não expõe erros internos', async () => {
    vi.mocked(transcreverMidia).mockResolvedValueOnce([{ text: 'Olá', speaker: null, startOffsetMs: 0, endOffsetMs: 10 }])
      .mockRejectedValueOnce(new Error('segredo interno'));
    const pedido = () => new NextRequest('https://exemplo.invalid/api/importacao/transcrever?formato=mp3', { method: 'POST', body: 'audio' });
    expect((await POST(pedido())).status).toBe(200);
    const erro = await POST(pedido()); expect(erro.status).toBe(502);
    expect(await erro.text()).not.toContain('segredo');
  });
});
