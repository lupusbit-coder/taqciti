/**
 * `POST /api/answers` valida o que chega antes de usar (S15) e não devolve
 * detalhe interno ao cliente (S11).
 *
 * O `documentData` volta da extensão e é entrada de cliente: com `as
 * DocumentData`, um campo torto virava TypeError (500) no render. Os testes
 * fixam que forma errada é 400 com mensagem, que documento salvo por versão
 * antiga (sem citações) continua aceito, e que campo desconhecido não some —
 * a extensão guarda o `documentData` que esta rota devolve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/documentos/doCatalogo', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('@/lib/documentos/doCatalogo')>()),
  // O PDF não é o assunto aqui, e gerá-lo de verdade é lento.
  renderPdfDoCatalogo: async () => Buffer.from('pdf'),
}));

import { POST } from '@/app/api/answers/route';

const CHAVE = 'chave-de-teste';
const pedirCru = (corpo: string) =>
  POST(
    new NextRequest('http://localhost/api/answers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-docciti-key': CHAVE },
      body: corpo,
    }),
  );
const pedir = (documentData: unknown, extra: Record<string, unknown> = {}) =>
  pedirCru(JSON.stringify({ documentType: 'ata', documentData, answers: [], gaps: [], ...extra }));

beforeEach(() => {
  vi.stubEnv('DOCCITI_SHARED_KEY', CHAVE);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/answers — documentData validado (S15)', () => {
  it('forma errada vira 400 com o caminho do campo, nunca 500', async () => {
    const r = await pedir({ participants: 'Maria' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/documentData\.participants/);
  });

  it('citação com tipo errado vira 400', async () => {
    const r = await pedir({ decisions: [{ text: 'Manter', quotes: [42] }] });
    expect(r.status).toBe(400);
  });

  it('texto acima do teto vira 400', async () => {
    const r = await pedir({ executiveSummary: [{ text: 'a'.repeat(20_001), quotes: [] }] });
    expect(r.status).toBe(400);
  });

  it('lista acima do teto vira 400', async () => {
    const participantes = Array.from({ length: 501 }, (_, i) => ({ name: `P${i}`, roleSource: 'meeting', quotes: [] }));
    const r = await pedir({ participants: participantes });
    expect(r.status).toBe(400);
  });

  it('corpo acima de 2 MB vira 413 antes do parse', async () => {
    const r = await pedirCru(`{"x":"${'a'.repeat(2_000_001)}"}`);
    expect(r.status).toBe(413);
  });

  it('documento sem citações (salvo por versão antiga) continua aceito', async () => {
    const r = await pedir(
      { participants: [{ name: 'Maria' }], decisions: [{ text: 'Manter o prazo' }] },
      {
        answers: [{ questionId: 'participantes:participants[Maria].role', answer: 'Gerente' }],
        gaps: [{ sectionId: 'participantes', field: 'participants[Maria].role', question: 'Cargo?', why: 'x' }],
      },
    );
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.documentData.participants[0]).toMatchObject({ name: 'Maria', role: 'Gerente', roleSource: 'user' });
  });

  it('campo desconhecido volta intacto — a extensão guarda o que a rota devolve', async () => {
    const r = await pedir({ metadata: { date: '12/08/2026', campoNovo: 'x' }, campoDoFuturo: [1, 2] });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.documentData.campoDoFuturo).toEqual([1, 2]);
    expect(corpo.documentData.metadata.campoNovo).toBe('x');
  });
});

describe('POST /api/answers — erro interno não chega ao cliente (S11)', () => {
  it('a guarda de vazamento recusa com texto genérico, sem listar as frases', async () => {
    const r = await pedir({ executiveSummary: [{ text: 'O que escrever aqui', quotes: [] }] });
    expect(r.status).toBe(400);
    const { error } = await r.json();
    expect(error).not.toMatch(/O que escrever aqui/);
    expect(error).not.toMatch(/vazou/);
    expect(console.error).toHaveBeenCalled();
  });
});
