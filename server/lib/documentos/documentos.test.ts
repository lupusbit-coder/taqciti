import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERFIL_CITI_PROVISORIO,
  perfilSchema,
  resolverVariante,
  diagnosticarVariante,
  varianteAplicavel,
  PAPEIS_DE_ESTILO,
  VARIANTE_DOS_PERSONALIZADOS,
} from './perfil';
import {
  aplicarPatch,
  blocoSchema,
  ConflitoDeRevisao,
  contentTreeSchema,
  validarArvore,
  type ContentTree,
} from './contentTree';
import { documentBriefSchema } from './contratos';

const arvore = (over: Partial<ContentTree> = {}): ContentTree =>
  contentTreeSchema.parse({
    revisao: 3,
    titulo: 'Proposta Aurora',
    blocos: [
      { tipo: 'capa', blockId: 'capa', titulo: 'Proposta Aurora' },
      { tipo: 'titulo', blockId: 't1', nivel: 1, texto: 'Contexto' },
      { tipo: 'paragrafo', blockId: 'p1', texto: 'Texto.', classificacao: 'fato', fontes: [{ fonteId: 'm1' }] },
    ],
    ...over,
  });

describe('perfil documental', () => {
  it('o perfil provisório é válido, provisório e não tem validador', () => {
    expect(() => perfilSchema.parse(PERFIL_CITI_PROVISORIO)).not.toThrow();
    expect(PERFIL_CITI_PROVISORIO.estado).toBe('provisorio');
  });

  it('tem as variantes ata (padrão) e editorial', () => {
    expect(PERFIL_CITI_PROVISORIO.variantes.map((v) => v.id)).toEqual(['ata', 'editorial']);
    expect(resolverVariante(PERFIL_CITI_PROVISORIO).id).toBe('ata');
    expect(resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial').id).toBe('editorial');
    expect(() => resolverVariante(PERFIL_CITI_PROVISORIO, 'inexistente')).toThrow();
  });

  it('toda variante define todos os papéis de estilo, cada um com proveniência', () => {
    for (const variante of PERFIL_CITI_PROVISORIO.variantes) {
      for (const papel of PAPEIS_DE_ESTILO) {
        expect(variante.estilos[papel]?.proveniencia.referencia, `${variante.id}/${papel}`).toBeTruthy();
      }
    }
  });

  it('o que não vem do modelo é marcado como inferido, não como observado', () => {
    const ata = resolverVariante(PERFIL_CITI_PROVISORIO, 'ata');
    const editorial = resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial');
    expect(ata.estilos.legenda?.proveniencia.tipo).toBe('inferida');
    expect(editorial.estilos.legenda?.proveniencia.tipo).toBe('inferida');
  });

  it('a variante editorial registra as medidas e as cores observadas na apostila', () => {
    const editorial = resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial');
    expect(editorial.pagina.margemPt.valor).toBe(54);
    expect(editorial.estilos.corpo?.valor).toMatchObject({ tamanhoPt: 9.7, entrelinha: 1.54 });
    expect(editorial.cores.verde?.valor).toBe('#12957A');
    expect(editorial.cores.fundoDestaqueEscuro?.valor).toBe('#081021');
    expect(editorial.componentes.map((c) => c.id)).toEqual(
      expect.arrayContaining(['capa_gradiente', 'destaque_formula', 'atividade_com_pauta', 'tabela_listrada']),
    );
  });

  it('documento personalizado sem variante pedida sai no estilo da Apostila, seja qual for o redator', () => {
    expect(VARIANTE_DOS_PERSONALIZADOS).toBe('editorial');
    const variante = resolverVariante(PERFIL_CITI_PROVISORIO, VARIANTE_DOS_PERSONALIZADOS);
    expect(varianteAplicavel(variante)).toBe(true);
  });

  it('a variante ata é aplicável sem nenhuma pendência', () => {
    const ata = resolverVariante(PERFIL_CITI_PROVISORIO, 'ata');
    expect(diagnosticarVariante(ata)).toEqual([]);
    expect(varianteAplicavel(ata)).toBe(true);
  });

  it('a editorial é aplicável, mas só pelas substituições autorizadas — e o diagnóstico as lista', () => {
    const editorial = resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial');
    const faltas = diagnosticarVariante(editorial);
    expect(faltas.length).toBeGreaterThan(0);
    expect(faltas.every((f) => f.tipo === 'fonte_ausente' && f.substituicao)).toBe(true);
    expect(faltas.find((f) => f.item.startsWith('Neue Haas'))?.substituicao).toBe('Barlow');
    expect(faltas.find((f) => f.item.startsWith('Monoespaçada'))?.substituicao).toBe('JetBrains Mono');
    expect(varianteAplicavel(editorial)).toBe(true);
    // Toda substituição tem registro de quem autorizou.
    for (const fonte of editorial.fontes.filter((f) => f.substituicaoAutorizada)) {
      expect(fonte.autorizacao, fonte.familia).toBeTruthy();
    }
  });

  it('sem a autorização, fonte ausente volta a bloquear a variante', () => {
    const base = resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial');
    const semAutorizacao = {
      ...base,
      fontes: base.fontes.map(({ substituicaoAutorizada: _s, autorizacao: _a, ...f }) => f),
    };
    expect(varianteAplicavel(semAutorizacao)).toBe(false);
  });

  it('ativo ausente bloqueia, e todo arquivo declarado existe no disco', () => {
    const base = resolverVariante(PERFIL_CITI_PROVISORIO, 'editorial');
    expect(
      varianteAplicavel({
        ...base,
        ativos: [...base.ativos, { id: 'x', descricao: 'Arte que falta', disponibilidade: 'ausente' }],
      }),
    ).toBe(false);

    const raiz = resolve(__dirname, '../../..');
    for (const variante of PERFIL_CITI_PROVISORIO.variantes) {
      const arquivos = [...variante.ativos, ...variante.fontes]
        .filter((i) => i.disponibilidade === 'presente' && i.arquivo)
        .map((i) => i.arquivo!);
      for (const arquivo of arquivos) {
        expect(existsSync(resolve(raiz, arquivo)), arquivo).toBe(true);
      }
    }
  });
  it('o perfil avisa que a apostila é só referência visual', () => {
    expect(PERFIL_CITI_PROVISORIO.observacoes.join(' ')).toContain('ESTILO VISUAL');
  });

});
describe('ContentTree', () => {
  it('não aceita bloco de HTML livre nem tipo desconhecido', () => {
    expect(blocoSchema.safeParse({ tipo: 'html', blockId: 'x', html: '<b>' }).success).toBe(false);
  });

  it('imagem exige texto alternativo', () => {
    expect(blocoSchema.safeParse({ tipo: 'imagem', blockId: 'i', ativoId: 'a' }).success).toBe(false);
  });

  /*
   * S8: /api/documentos/renderizar compila a árvore que chegar, sem modelo no
   * meio. Campo sem teto é CPU de graça no pdfkit/docx — por isso TODO texto e
   * toda lista têm `.max()`, e a árvore inteira tem orçamento de células e de
   * caracteres (campo a campo, 3.000 tabelas de 3.000×40 passariam).
   */
  it.each([
    ['capa.titulo', { tipo: 'capa', blockId: 'c', titulo: 'x'.repeat(2_001) }],
    ['capa.cliente', { tipo: 'capa', blockId: 'c', titulo: 'T', cliente: 'x'.repeat(2_001) }],
    ['titulo.texto', { tipo: 'titulo', blockId: 't', nivel: 1, texto: 'x'.repeat(2_001) }],
    ['blockId', { tipo: 'sumario', blockId: 'x'.repeat(201) }],
    ['referencia.texto', { tipo: 'referencia', blockId: 'r', texto: 'x'.repeat(60_001) }],
    ['imagem.textoAlternativo', { tipo: 'imagem', blockId: 'i', ativoId: 'a', textoAlternativo: 'x'.repeat(2_001) }],
    ['fontes[].trecho', { tipo: 'paragrafo', blockId: 'p', texto: 'oi', fontes: [{ fonteId: 'm', trecho: 'x'.repeat(60_001) }] }],
  ])('recusa %s acima do teto', (_campo, bloco) => {
    expect(blocoSchema.safeParse(bloco).success).toBe(false);
  });

  it('recusa título da árvore e lacuna acima do teto', () => {
    const base = { revisao: 0, blocos: [] };
    expect(contentTreeSchema.safeParse({ ...base, titulo: 'x'.repeat(2_001) }).success).toBe(false);
    expect(
      contentTreeSchema.safeParse({ ...base, titulo: 'T', lacunas: [{ campo: 'c', pergunta: 'x'.repeat(2_001) }] }).success,
    ).toBe(false);
  });

  it('recusa árvore cujas tabelas somam células demais, mesmo com cada tabela no teto', () => {
    const linhas = Array.from({ length: 2_600 }, () => Array.from({ length: 20 }, () => 'c'));
    const tabela = (n: number) => ({ tipo: 'tabela', blockId: `t${n}`, cabecalho: ['a'], linhas });
    // Cada tabela tem 52.001 células (dentro dos tetos por tabela); duas passam de 100.000.
    expect(contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: [tabela(1)] }).success).toBe(true);
    const resultado = contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: [tabela(1), tabela(2)] });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toMatch(/células/);
  });

  /*
   * O orçamento soma TODA string da árvore, de forma genérica. A primeira versão
   * somava campo a campo e esquecia capa, legenda, texto alternativo e lacunas:
   * 4,8 milhões em parágrafos mais 400 mil em legendas passavam.
   */
  it('o orçamento conta legenda e texto alternativo', () => {
    const paragrafos = Array.from({ length: 80 }, (_, i) => ({ tipo: 'paragrafo', blockId: `p${i}`, texto: 'x'.repeat(60_000) }));
    const imagens = Array.from({ length: 100 }, (_, i) => ({
      tipo: 'imagem',
      blockId: `i${i}`,
      ativoId: 'a',
      legenda: 'x'.repeat(2_000),
      textoAlternativo: 'x'.repeat(2_000),
    }));
    expect(contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: paragrafos }).success).toBe(true);
    const r = contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: [...paragrafos, ...imagens] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/caracteres/);
  });

  it('o orçamento conta as lacunas e a capa', () => {
    const paragrafos = Array.from({ length: 80 }, (_, i) => ({ tipo: 'paragrafo', blockId: `p${i}`, texto: 'x'.repeat(60_000) }));
    const capa = { tipo: 'capa', blockId: 'capa', titulo: 'x'.repeat(2_000), subtitulo: 'x'.repeat(2_000) };
    const lacunas = Array.from({ length: 500 }, () => ({ campo: 'x'.repeat(2_000), pergunta: 'x'.repeat(2_000) }));
    const r = contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos: [capa, ...paragrafos], lacunas });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/caracteres/);
  });

  it('recusa árvore que soma caracteres demais, mesmo com cada parágrafo no teto', () => {
    const blocos = Array.from({ length: 84 }, (_, i) => ({ tipo: 'paragrafo', blockId: `p${i}`, texto: 'x'.repeat(60_000) }));
    const resultado = contentTreeSchema.safeParse({ revisao: 0, titulo: 'T', blocos });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toMatch(/caracteres/);
  });

  it('árvore correta não tem problemas', () => {
    expect(validarArvore(arvore())).toEqual([]);
  });

  it('acusa id duplicado, capa fora do começo, fato sem fonte, sumário repetido e sumário antes da capa', () => {
    const problemas = validarArvore(
      arvore({
        blocos: [
          { tipo: 'titulo', blockId: 'a', nivel: 1, texto: 'A', fontes: [], origem: 'agente' },
          { tipo: 'capa', blockId: 'a', variante: 'padrao', titulo: 'C', fontes: [], origem: 'agente' },
          { tipo: 'paragrafo', blockId: 'b', texto: 'x', classificacao: 'fato', fontes: [], origem: 'agente' },
          { tipo: 'sumario', blockId: 's', fontes: [], origem: 'agente' },
          { tipo: 'sumario', blockId: 's2', fontes: [], origem: 'agente' },
        ],
      }),
    ).map((p) => p.problema);
    expect(problemas).toEqual(
      expect.arrayContaining([
        'blockId duplicado.',
        'A capa só pode ser o primeiro bloco.',
        'Fato sem fonte registrada.',
        'O documento só pode ter um sumário.',
      ]),
    );
  });

  it('patch troca só o bloco pedido, sobe a revisão e preserva o resto', () => {
    const antes = arvore();
    const depois = aplicarPatch(antes, 3, [
      {
        op: 'substituir',
        blockId: 'capa',
        bloco: blocoSchema.parse({ tipo: 'capa', blockId: 'capa', titulo: 'Novo título' }),
      },
    ]);
    expect(depois.revisao).toBe(4);
    expect(depois.blocos[0]).toMatchObject({ titulo: 'Novo título' });
    expect(depois.blocos.slice(1)).toEqual(antes.blocos.slice(1));
    expect(antes.revisao).toBe(3);
  });

  it('patch com revisão velha é recusado, e bloco inexistente também', () => {
    expect(() => aplicarPatch(arvore(), 2, [])).toThrow(ConflitoDeRevisao);
    expect(() => aplicarPatch(arvore(), 3, [{ op: 'remover', blockId: 'nao-existe' }])).toThrow();
  });

  it('insere depois de um bloco, ou no começo com null', () => {
    const novo = blocoSchema.parse({ tipo: 'paragrafo', blockId: 'n', texto: 'N' });
    expect(aplicarPatch(arvore(), 3, [{ op: 'inserir_depois', blockId: 't1', bloco: novo }]).blocos[2]).toMatchObject({ blockId: 'n' });
    expect(aplicarPatch(arvore(), 3, [{ op: 'inserir_depois', blockId: null, bloco: novo }]).blocos[0]).toMatchObject({ blockId: 'n' });
  });
});

describe('contratos', () => {
  it('o brief nasce com perfil CITi, idioma pt-BR e sem pendências', () => {
    const brief = documentBriefSchema.parse({
      finalidade: 'Proposta',
      pedido: 'Monte uma proposta',
      fontesSelecionadas: ['m1'],
      formatos: ['pdf'],
    });
    expect(brief).toMatchObject({ perfilId: 'citi', idioma: 'pt-BR', camposPendentes: [] });
  });

});
