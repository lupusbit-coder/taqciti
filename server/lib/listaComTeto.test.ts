/**
 * S8 de verdade: lista gigante é recusada pelo TAMANHO, sem validar item por
 * item.
 *
 * No zod 3, `z.array(item).max(N)` valida todos os itens antes do `.max()`.
 * Medido em 11/2026: 4,4 MB de `blocos: [{}, {}, ...]` custaram ~7 s de CPU e
 * ~770 MB em `/api/documentos/renderizar` antes da recusa. A prova aqui não é o
 * relógio (frágil em CI), e sim o NÚMERO DE ISSUES: validar item por item gera
 * ao menos uma por item; a recusa pelo tamanho gera uma só.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { excedeOrcamentoDeNos, listaComTeto } from './listaComTeto';
import { contentTreeSchema } from './documentos/contentTree';
import { corpoDeEdicaoSchema, corpoDeGeracaoSchema, lerCorpoComTeto } from './documentos/requisicao';
import { documentDataSchema } from './documentDataSchema';

const GIGANTE = 200_000;
const vazios = (): unknown[] => Array.from({ length: GIGANTE }, () => ({}));

describe('listaComTeto', () => {
  it('acima do teto: uma issue só, sem validar os itens', () => {
    const r = listaComTeto(z.object({ a: z.string() }), 10).safeParse(vazios());
    expect(r.success).toBe(false);
    expect(r.error?.issues).toHaveLength(1);
    expect(r.error?.issues[0]?.message).toMatch(/No máximo 10/);
  });

  it('dentro do teto valida os itens como sempre, com mínimo', () => {
    const lista = listaComTeto(z.string(), 3, 1);
    expect(lista.safeParse(['a', 'b']).success).toBe(true);
    expect(lista.safeParse([]).success).toBe(false);
    expect(lista.safeParse(['a', 1]).success).toBe(false);
  });

  it('valor que não é lista recebe o erro de tipo de sempre', () => {
    const r = listaComTeto(z.string(), 3).safeParse('x');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.code).toBe('invalid_type');
  });
});

describe('os schemas da rede recusam lista gigante de itens inválidos com uma issue', () => {
  it('contentTreeSchema.blocos', () => {
    const r = contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: vazios() });
    expect(r.success).toBe(false);
    expect(r.error!.issues.length).toBe(1);
  });

  it('linhas de tabela dentro de um bloco', () => {
    const r = contentTreeSchema.safeParse({
      revisao: 0,
      titulo: 'T',
      blocos: [{ tipo: 'tabela', blockId: 't', cabecalho: ['a'], linhas: vazios() }],
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues.length).toBeLessThanOrEqual(2);
  });

  it('documentDataSchema (participants, generic)', () => {
    const lista = documentDataSchema.safeParse({ participants: vazios() });
    expect(lista.success).toBe(false);
    if (!lista.success) expect(lista.error.issues.length).toBe(1);

    const secoes = Object.fromEntries(Array.from({ length: GIGANTE }, (_, i) => [`s${i}`, 'x']));
    const generic = documentDataSchema.safeParse({ generic: secoes });
    expect(generic.success).toBe(false);
    if (!generic.success) expect(generic.error.issues.length).toBe(1);
  });

  it('corpoDeEdicaoSchema (fontes, escopo) e corpoDeGeracaoSchema (orientações)', () => {
    const arvore = { revisao: 0, titulo: 'T', blocos: [] };
    const base = { pedido: 'x', arvore, revisaoEsperada: 0 };
    const fontes = corpoDeEdicaoSchema.safeParse({ ...base, fontes: vazios() });
    expect(fontes.success).toBe(false);
    expect(fontes.error!.issues.length).toBe(1);
    const escopo = corpoDeEdicaoSchema.safeParse({ ...base, fontes: [], escopo: vazios() });
    expect(escopo.error!.issues.length).toBe(1);
    const orientacoes = corpoDeGeracaoSchema.safeParse({
      pedido: 'x',
      fontes: [{ id: 'f', texto: 't' }],
      orientacoesEditoriais: vazios(),
    });
    expect(orientacoes.error!.issues.length).toBe(1);
  });

  it('geração continua exigindo ao menos uma fonte, com a mensagem de sempre', () => {
    const r = corpoDeGeracaoSchema.safeParse({ pedido: 'x', fontes: [] });
    expect(r.error?.issues[0]?.message).toBe('Envie ao menos uma fonte.');
  });
});

/*
 * O orçamento de NÓS pega o que `listaComTeto` não pega: listas aninhadas que
 * passam nível a nível. Os dois casos medidos pela revisão (11/2026):
 * tabelas de 3.000×40 células inválidas (2,1 s, 747 MB, 2 milhões de issues) e
 * `documentData` com 9 listas × 500 × 100 citações `{}` (1 s, 903 mil issues).
 * A recusa sai com UM erro, antes do `safeParse`.
 */
describe('orçamento de nós (antes do safeParse)', () => {
  const tabelasInvalidas = () => ({
    arvore: {
      revisao: 0,
      titulo: 'T',
      blocos: Array.from({ length: 17 }, (_, i) => ({
        tipo: 'tabela',
        blockId: `t${i}`,
        cabecalho: ['a'],
        linhas: Array.from({ length: 3_000 }, () => Array.from({ length: 40 }, () => ({}))),
      })),
    },
  });
  const documentDataInvalido = () => ({
    documentType: 'ata',
    documentData: Object.fromEntries(
      ['executiveSummary', 'participants', 'topicsDiscussed', 'decisions', 'outcomes', 'outputs', 'actionItems', 'openPoints', 'periods'].map(
        (lista) => [lista, Array.from({ length: 500 }, () => ({ quotes: Array.from({ length: 100 }, () => ({})) }))],
      ),
    ),
  });

  it.each([
    ['tabelas 3.000×40 de células inválidas', tabelasInvalidas],
    ['documentData com 9 listas × 500 × 100 citações vazias', documentDataInvalido],
  ])('%s: estoura o orçamento, e o corpo é recusado com 1 erro', async (_caso, montar) => {
    const corpo = montar();
    expect(excedeOrcamentoDeNos(corpo)).toBe(true);
    const r = await lerCorpoComTeto(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(corpo) }), 1e9);
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect((r as { error: string }).error).toMatch(/itens demais/);
  });

  it('o pior documento que o schema aceita cabe no orçamento', () => {
    // 3.000 blocos: 2.966 parágrafos com uma fonte e 34 tabelas de 1 coluna
    // somando ~100 mil células, cada uma numa linha própria (o pior caso de nós).
    const paragrafos = Array.from({ length: 2_966 }, (_, i) => ({
      tipo: 'paragrafo',
      blockId: `p${i}`,
      texto: 'x',
      classificacao: 'fato',
      fontes: [{ fonteId: 'f', trecho: 'x' }],
    }));
    const tabelas = Array.from({ length: 34 }, (_, i) => ({
      tipo: 'tabela',
      blockId: `t${i}`,
      cabecalho: ['a'],
      linhas: Array.from({ length: 2_900 }, () => ['c']),
    }));
    const arvore = { revisao: 0, titulo: 'T', blocos: [...paragrafos, ...tabelas] };
    expect(contentTreeSchema.safeParse(arvore).success).toBe(true);
    expect(excedeOrcamentoDeNos({ arvore })).toBe(false);
  });

  it('conta listas, objetos e valores', () => {
    expect(excedeOrcamentoDeNos([1, 2, 3], 4)).toBe(false); // lista + 3 valores
    expect(excedeOrcamentoDeNos([1, 2, 3, 4], 4)).toBe(true);
    expect(excedeOrcamentoDeNos({ a: { b: [1] } }, 4)).toBe(false);
    expect(excedeOrcamentoDeNos({ a: { b: [1, 2] } }, 4)).toBe(true);
  });
});

describe('lerCorpoComTeto', () => {
  const pedido = (corpo: string) => new Request('http://localhost/x', { method: 'POST', body: corpo });

  it('acima do teto é 413 sem parse', async () => {
    const r = await lerCorpoComTeto(pedido(`{"a":"${'x'.repeat(200)}"}`), 100);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it('JSON inválido é 400; válido devolve o corpo', async () => {
    expect(await lerCorpoComTeto(pedido('{x'), 100)).toMatchObject({ ok: false, status: 400 });
    expect(await lerCorpoComTeto(pedido('{"a":1}'), 100)).toEqual({ ok: true, corpo: { a: 1 } });
  });
});
