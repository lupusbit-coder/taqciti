/**
 * ContentTree — a árvore semântica do documento. É a fonte de verdade: DOCX,
 * PDF e preview saem dela, e uma revisão pelo chat vira um patch sobre blockIds.
 *
 * O redator entrega PAPÉIS ("título de seção"), nunca medidas. O compilador
 * resolve o papel num estilo do perfil. Não existe bloco de HTML/OOXML livre:
 * o conjunto de tipos abaixo é o catálogo do que o produto sabe montar, e
 * pedir outro tipo é erro de validação, não improviso.
 *
 * Campo ausente é aceito de propósito (`lacunas`): a saída estruturada pode
 * ter erro factual, e forçar preenchimento convida a inventar.
 */
import { z } from 'zod';
import { PAPEIS_DE_ESTILO } from './perfil';
import { listaComTeto } from '../listaComTeto';

/**
 * Tetos da árvore. Folgados para qualquer documento real (uma apostila longa
 * fica muito abaixo) e baixos o bastante para uma árvore forjada não prender a
 * CPU do pdfkit/docx: /api/documentos/renderizar compila o que chegar, sem
 * modelo no meio, e sem teto uma tabela de milhões de células era um DoS barato.
 *
 * TODO texto e toda lista têm `.max()` (S8 do plano de segurança, completado em
 * 11/2026: antes só parágrafo, lista e tabela tinham). Os tetos por campo não
 * bastam sozinhos — 3.000 tabelas de 3.000×40 células passariam campo a campo —,
 * então a árvore inteira tem ainda um orçamento de células e de caracteres
 * (`superRefine` de `contentTreeSchema`, que soma toda string da árvore). As
 * listas usam `listaComTeto`, que recusa pelo tamanho ANTES de validar item por
 * item. O `curto` (2.000) cobre títulos e rótulos: o
 * redator escreve títulos de seção que passam por `blocoSchema.parse` em
 * `gerar.ts`, e um teto apertado ali derrubaria a geração por um título longo.
 */
const LIMITE = {
  blocos: 3_000,
  fontes: 200,
  itens: 1_000,
  colunas: 40,
  linhas: 3_000,
  celula: 5_000,
  texto: 60_000,
  lacunas: 500,
  curto: 2_000,
  id: 200,
  /** Células somadas de todas as tabelas da árvore. */
  celulasNaArvore: 100_000,
  /** Caracteres somados de todos os textos da árvore. */
  caracteresNaArvore: 5_000_000,
} as const;

const curto = z.string().max(LIMITE.curto);
const id = z.string().min(1).max(LIMITE.id);

/** Fato sustentado, recomendação do agente, ou pendência. Recomendação nunca
 *  é decisão aprovada. */
export const CLASSIFICACOES = ['fato', 'recomendacao', 'pendencia'] as const;

export const referenciaDeFonteSchema = z.object({
  /** Id da reunião ou documento de origem. */
  fonteId: id,
  /** Citação literal ou âncora, quando houver. Fica no painel privado. */
  trecho: z.string().max(LIMITE.texto).optional(),
});
export type ReferenciaDeFonte = z.infer<typeof referenciaDeFonteSchema>;

const base = {
  blockId: id,
  papel: z.enum(PAPEIS_DE_ESTILO).optional(),
  fontes: listaComTeto(referenciaDeFonteSchema, LIMITE.fontes).default([]),
  classificacao: z.enum(CLASSIFICACOES).optional(),
  /** Origem da última edição: o agente ou uma pessoa. Edição humana sobrevive
   *  a uma nova solicitação. */
  origem: z.enum(['agente', 'pessoa']).default('agente'),
};

export const LAYOUT_HINTS = ['normal', 'compacto', 'quebra_antes', 'manter_junto'] as const;
const layoutHint = z.enum(LAYOUT_HINTS).optional();

export const blocoSchema = z.discriminatedUnion('tipo', [
  z.object({
    ...base,
    tipo: z.literal('capa'),
    variante: id.default('padrao'),
    titulo: curto.min(1),
    subtitulo: curto.optional(),
    autor: curto.optional(),
    cliente: curto.optional(),
    data: curto.optional(),
  }),
  z.object({
    ...base,
    tipo: z.literal('titulo'),
    nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    texto: curto.min(1),
    layout: layoutHint,
  }),
  z.object({ ...base, tipo: z.literal('paragrafo'), texto: z.string().min(1).max(LIMITE.texto), layout: layoutHint }),
  z.object({
    ...base,
    tipo: z.literal('lista'),
    ordenada: z.boolean().default(false),
    itens: listaComTeto(z.string().min(1).max(LIMITE.texto), LIMITE.itens, 1),
  }),
  z.object({
    ...base,
    tipo: z.literal('tabela'),
    cabecalho: listaComTeto(z.string().min(1).max(LIMITE.celula), LIMITE.colunas, 1),
    linhas: listaComTeto(listaComTeto(z.string().max(LIMITE.celula), LIMITE.colunas), LIMITE.linhas, 1),
    legenda: curto.optional(),
    layout: layoutHint,
  }),
  z.object({
    ...base,
    tipo: z.literal('imagem'),
    ativoId: id,
    legenda: curto.optional(),
    /** Obrigatório: imagem sem texto alternativo é defeito de acessibilidade. */
    textoAlternativo: curto.min(1),
  }),
  z.object({ ...base, tipo: z.literal('referencia'), texto: z.string().min(1).max(LIMITE.texto) }),
  z.object({ ...base, tipo: z.literal('quebra_de_secao') }),
  z.object({ ...base, tipo: z.literal('sumario') }),
]);
export type Bloco = z.infer<typeof blocoSchema>;
export type TipoDeBloco = Bloco['tipo'];

export const lacunaSchema = z.object({
  /** Bloco afetado, ou ausente quando a lacuna é do documento todo. */
  blockId: id.optional(),
  campo: curto.min(1),
  pergunta: curto.min(1),
});
export type LacunaDoDocumento = z.infer<typeof lacunaSchema>;

/**
 * Caracteres de TODAS as strings de um valor já validado, em qualquer
 * profundidade. Genérico de propósito: uma lista de campos a somar esquece o
 * campo novo (a primeira versão esquecia capa, legenda, texto alternativo e
 * lacunas), e o orçamento existe justamente para não haver texto fora dele.
 */
function caracteresDe(valor: unknown): number {
  if (typeof valor === 'string') return valor.length;
  if (Array.isArray(valor)) return valor.reduce((n: number, v) => n + caracteresDe(v), 0);
  if (valor && typeof valor === 'object') return caracteresDe(Object.values(valor));
  return 0;
}

const celulasDe = (bloco: Bloco): number =>
  bloco.tipo === 'tabela' ? bloco.cabecalho.length + bloco.linhas.reduce((n, l) => n + l.length, 0) : 0;

export const contentTreeSchema = z
  .object({
    /** Revisão esperada na gravação — controle de concorrência. */
    revisao: z.number().int().min(0),
    titulo: curto.min(1),
    blocos: listaComTeto(blocoSchema, LIMITE.blocos),
    lacunas: listaComTeto(lacunaSchema, LIMITE.lacunas).default([]),
  })
  .superRefine((arvore, ctx) => {
    // A árvore inteira: título, blocos (com fontes, capa, legendas) e lacunas.
    const caracteres = caracteresDe(arvore);
    const celulas = arvore.blocos.reduce((n, bloco) => n + celulasDe(bloco), 0);
    if (celulas > LIMITE.celulasNaArvore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocos'],
        message: `As tabelas somam ${celulas} células; o limite do documento é ${LIMITE.celulasNaArvore}.`,
      });
    }
    if (caracteres > LIMITE.caracteresNaArvore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocos'],
        message: `O documento soma ${caracteres} caracteres; o limite é ${LIMITE.caracteresNaArvore}.`,
      });
    }
  });
export type ContentTree = z.infer<typeof contentTreeSchema>;

/** Tipos de bloco que o compilador atual sabe montar. Um tipo do schema fora
 *  desta lista é aceito como dado, mas o catálogo técnico NÃO o promete. */
export const TIPOS_COMPILAVEIS: readonly TipoDeBloco[] = [
  'capa',
  'titulo',
  'paragrafo',
  'lista',
  'tabela',
  'imagem',
  'referencia',
  'sumario',
  'quebra_de_secao',
];

export interface ProblemaDaArvore {
  blockId?: string;
  problema: string;
}

/**
 * Validação estrutural, sem modelo: ids duplicados, capa fora do começo ou
 * repetida, tipo que o compilador ainda não monta, fato sem fonte.
 */
export function validarArvore(arvore: ContentTree): ProblemaDaArvore[] {
  const problemas: ProblemaDaArvore[] = [];
  const vistos = new Set<string>();
  let sumarios = 0;
  arvore.blocos.forEach((bloco, indice) => {
    if (vistos.has(bloco.blockId)) {
      problemas.push({ blockId: bloco.blockId, problema: 'blockId duplicado.' });
    }
    vistos.add(bloco.blockId);

    if (bloco.tipo === 'sumario') {
      sumarios += 1;
      if (sumarios > 1) {
        problemas.push({ blockId: bloco.blockId, problema: 'O documento só pode ter um sumário.' });
      }
      if (indice === 0) {
        problemas.push({ blockId: bloco.blockId, problema: 'O sumário vem depois da capa.' });
      }
    }
    if (bloco.tipo === 'capa' && indice !== 0) {
      problemas.push({ blockId: bloco.blockId, problema: 'A capa só pode ser o primeiro bloco.' });
    }
    if (!TIPOS_COMPILAVEIS.includes(bloco.tipo)) {
      problemas.push({
        blockId: bloco.blockId,
        problema: `O bloco "${bloco.tipo}" ainda não é suportado pelo compilador.`,
      });
    }
    if (bloco.classificacao === 'fato' && bloco.fontes.length === 0) {
      problemas.push({ blockId: bloco.blockId, problema: 'Fato sem fonte registrada.' });
    }
  });
  return problemas;
}

/** Aplica um patch limitado a blocos (por id), exigindo a revisão esperada. */
export type PatchDeBlocos =
  | { op: 'substituir'; blockId: string; bloco: Bloco }
  | { op: 'remover'; blockId: string }
  | { op: 'inserir_depois'; blockId: string | null; bloco: Bloco };

export class ConflitoDeRevisao extends Error {
  constructor(
    readonly esperada: number,
    readonly atual: number,
  ) {
    super(`Revisão esperada ${esperada}, mas o documento está na ${atual}.`);
  }
}

export function aplicarPatch(
  arvore: ContentTree,
  revisaoEsperada: number,
  patches: readonly PatchDeBlocos[],
): ContentTree {
  if (arvore.revisao !== revisaoEsperada) {
    throw new ConflitoDeRevisao(revisaoEsperada, arvore.revisao);
  }
  let blocos = [...arvore.blocos];
  for (const patch of patches) {
    const indice = patch.op === 'inserir_depois' && patch.blockId === null
      ? -1
      : blocos.findIndex((b) => b.blockId === patch.blockId);
    if (indice === -1 && !(patch.op === 'inserir_depois' && patch.blockId === null)) {
      throw new Error(`Bloco "${patch.blockId}" não existe nesta revisão.`);
    }
    if (patch.op === 'substituir') blocos[indice] = patch.bloco;
    else if (patch.op === 'remover') blocos = blocos.filter((_, i) => i !== indice);
    else blocos.splice(indice + 1, 0, patch.bloco);
  }
  return { ...arvore, blocos, revisao: arvore.revisao + 1 };
}
