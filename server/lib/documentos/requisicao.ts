/**
 * Contrato HTTP dos documentos personalizados: o que as rotas aceitam e como
 * cada falha vira status. Mora fora das rotas para ser testado sem subir o
 * Next.
 */
import { z } from 'zod';
import { contentTreeSchema, ConflitoDeRevisao } from './contentTree';
import { ErroDeCompilacao } from './compilador';
import { DocumentoSemConteudoError } from './doCatalogo';
import { OverloadedError, RateLimitError } from '../ai/types';
import { ErroDeGeracao, type ResultadoDaEdicao, type ResultadoDoDocumento } from './gerar';
import { excedeOrcamentoDeNos, listaComTeto, ORCAMENTO_DE_NOS } from '../listaComTeto';

/**
 * Tetos do contrato. Toda lista passa por `listaComTeto`, que recusa pelo
 * tamanho antes de validar item por item (ver o cabeçalho de lá). O texto das
 * fontes não tem teto por campo: quem o limita é a soma (`totalDeCaracteres`
 * contra `maxTranscriptChars`, nas rotas) e, antes do parse, `lerCorpoComTeto`.
 *
 * `pedido` tem teto largo (200 mil) de propósito: o Taq monta o pedido como
 * "Pedido da pessoa: … Detalhamento: …" sem limite no cliente
 * (`src/features/taq/ferramentas.ts`), e recusar ali quebraria um uso legítimo.
 * O teto existe só para não haver campo sem limite; o corpo inteiro já é
 * limitado por `tetoDoCorpo`.
 */
const LIMITE = {
  fontes: 200,
  escopo: 3_000,
  orientacoes: 50,
  id: 200,
  curto: 2_000,
  pedido: 200_000,
} as const;

const fonteSchema = z.object({
  id: z.string().min(1).max(LIMITE.id),
  titulo: z.string().max(LIMITE.curto).default(''),
  texto: z.string(),
});

const comum = {
  pedido: z.string().min(1, '"pedido" é obrigatório.').max(LIMITE.pedido),
  fontes: listaComTeto(fonteSchema, LIMITE.fontes).refine((l) => l.length > 0, 'Envie ao menos uma fonte.'),
  variante: z.string().min(1).max(LIMITE.id).optional(),
  /** Declara que o conteúdo é sintético — ver a trava de política de dados. */
  sintetica: z.boolean().optional(),
};

export const corpoDeGeracaoSchema = z.object({
  ...comum,
  capa: z
    .object({
      cliente: z.string().max(LIMITE.curto).optional(),
      autor: z.string().max(LIMITE.curto).optional(),
      data: z.string().max(LIMITE.curto).optional(),
    })
    .optional(),
  extensao: z
    .object({
      paginas: z.number().int().positive(),
      tipo: z.enum(['firme', 'aproximada']),
      incluiCapa: z.boolean().optional(),
    })
    .optional(),
  orientacoesEditoriais: listaComTeto(z.string().max(LIMITE.curto), LIMITE.orientacoes).optional(),
});

export const corpoDeEdicaoSchema = z.object({
  ...comum,
  // Alterar o título da capa não precisa de fonte nenhuma; conteúdo novo que
  // afirma fato continua exigindo citação, e sem fonte ele simplesmente cai.
  fontes: listaComTeto(fonteSchema, LIMITE.fontes),
  arvore: contentTreeSchema,
  revisaoEsperada: z.number().int().min(0),
  escopo: listaComTeto(z.string().min(1).max(LIMITE.id), LIMITE.escopo).optional(),
});

/**
 * Tetos do CORPO, em caracteres, conferidos antes do `JSON.parse` — o mesmo
 * padrão de `/api/answers` e `/api/sync`. Sem eles, o corpo inteiro vira objeto
 * na memória e só depois algum teto do schema o recusa.
 *
 * O limite que manda em produção é o da Vercel: corpo de função acima de
 * 4,5 MB é recusado por ela, antes de chegar aqui. Um teto nosso acima disso
 * (a primeira versão usava 9 milhões para a árvore) não protegeria nada em
 * produção e só valeria em outro host. Por isso os tetos ficam ABAIXO de 4,5 MB
 * — a recusa sai daqui, com mensagem nossa, e vale igual em qualquer host:
 *
 * - árvore: 3 milhões de caracteres. Um documento real fica na casa das
 *   centenas de milhares; o orçamento de 5 milhões de texto de
 *   `contentTreeSchema` é teto de forma, não de transporte, e nem cabe no
 *   limite da Vercel.
 * - fontes: o teto de conteúdo é `maxTranscriptChars()` (400 mil por padrão);
 *   o JSON pode quase dobrar um texto cheio de quebras de linha e aspas
 *   escapadas, daí o dobro.
 * - folga de 500 mil para pedido, capa, orientações e o resto.
 *
 * Com os padrões: renderizar 3,5 M, gerar 1,3 M, editar 4,3 M — todos abaixo
 * de 4,5 MB. Um `DOCCITI_MAX_TRANSCRIPT_CHARS` maior pode fazer gerar e editar
 * passarem do limite da Vercel; aí quem recusa é ela.
 */
export const TETO_DA_ARVORE_NO_CORPO = 3_000_000;
const FOLGA_DO_CORPO = 500_000;

export const tetoDoCorpo = {
  renderizar: (): number => TETO_DA_ARVORE_NO_CORPO + FOLGA_DO_CORPO,
  gerar: (limiteDasFontes: number): number => 2 * limiteDasFontes + FOLGA_DO_CORPO,
  editar: (limiteDasFontes: number): number => 2 * limiteDasFontes + TETO_DA_ARVORE_NO_CORPO + FOLGA_DO_CORPO,
};

/**
 * Lê o corpo como texto, recusa acima de `teto` caracteres (413) e só então
 * faz o parse (400 se não for JSON). O `content-length` declarado recusa cedo,
 * sem ler; o tamanho real é conferido de novo, porque o cabeçalho pode mentir
 * ou faltar. Depois do parse, o orçamento de nós (`excedeOrcamentoDeNos`)
 * recusa estrutura grande demais antes do `safeParse` (413).
 */
export async function lerCorpoComTeto(
  request: Request,
  teto: number,
): Promise<{ ok: true; corpo: unknown } | { ok: false; status: 400 | 413; error: string }> {
  const acima = { ok: false as const, status: 413 as const, error: `Corpo da requisição acima de ${teto} caracteres.` };
  if (Number(request.headers.get('content-length') ?? 0) > teto * 4) return acima;
  const bruto = await request.text();
  if (bruto.length > teto) return acima;
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return { ok: false, status: 400, error: 'Corpo da requisição precisa ser JSON válido.' };
  }
  if (excedeOrcamentoDeNos(corpo)) return estruturaGrandeDemais;
  return { ok: true, corpo };
}

/** A recusa do orçamento de nós, igual em todas as rotas. */
export const estruturaGrandeDemais = {
  ok: false as const,
  status: 413 as const,
  error: `O corpo tem itens demais (mais de ${ORCAMENTO_DE_NOS} valores, listas e objetos somados).`,
};

/** Soma dos caracteres das fontes — é o que o modelo vai ler. */
export const totalDeCaracteres = (fontes: readonly { texto: string }[]): number =>
  fontes.reduce((soma, f) => soma + f.texto.length, 0);

/** A primeira mensagem de erro do zod, legível. */
export function mensagemDeValidacao(erro: z.ZodError): string {
  const primeiro = erro.issues[0];
  if (!primeiro) return 'Corpo da requisição inválido.';
  const onde = primeiro.path.length > 0 ? `"${primeiro.path.join('.')}": ` : '';
  return `${onde}${primeiro.message}`;
}

/** Erro conhecido → status e mensagem. `null` = desconhecido: a rota decide. */
export function erroConhecido(erro: unknown): { status: number; error: string } | null {
  if (erro instanceof ConflitoDeRevisao) {
    return {
      status: 409,
      error: `${erro.message} O documento mudou desde que você o abriu; recarregue a versão atual.`,
    };
  }
  if (
    erro instanceof ErroDeGeracao ||
    erro instanceof ErroDeCompilacao ||
    erro instanceof DocumentoSemConteudoError
  ) {
    return { status: 422, error: erro.message };
  }
  // O provedor de IA, dito como é: cota ou sobrecarga. Quem usa precisa saber que
  // não é erro dele nem do documento — e se espera ou não.
  if (erro instanceof RateLimitError) {
    return {
      status: 429,
      error: erro.perDay
        ? 'O provedor de IA atingiu a cota do dia. O documento só pode ser gerado ou alterado quando ela reabrir.'
        : 'O provedor de IA está com muitas chamadas agora. Tente de novo em um minuto.',
    };
  }
  if (erro instanceof OverloadedError) {
    return { status: 503, error: 'O provedor de IA está sobrecarregado. Tente de novo em instantes.' };
  }
  return null;
}

/** O resultado como vai pela rede: o PDF em base64, como `/api/answers` faz. */
export function serializarResultado(r: ResultadoDoDocumento | ResultadoDaEdicao) {
  const { pdf, usage: _usage, ...resto } = r;
  return { ...resto, pdf: pdf.toString('base64') };
}
