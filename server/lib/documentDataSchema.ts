/**
 * A forma do `DocumentData` que CHEGA PELA REDE (`POST /api/answers`).
 *
 * O `DocumentData` nasce no servidor (`generateDocument`), vai para a extensão e
 * volta quando a pessoa responde uma lacuna. Na volta ele é entrada de cliente,
 * e até 11/2026 a rota o aceitava com `as DocumentData` (S15 do plano de
 * segurança): um campo torto — `participants` como string, uma citação como
 * número — virava TypeError (500) dentro do render, e listas ou textos enormes
 * viravam trabalho de CPU no HTML e no PDF.
 *
 * Três decisões:
 *
 * - **Tetos em tudo**: `.max()` em todo texto, e toda lista por `listaComTeto`,
 *   que recusa pelo tamanho ANTES de validar item por item (no zod 3, o `.max()`
 *   de `z.array` só pesa depois de validar todos os itens). São generosos — uma
 *   reunião longa cabe com folga — porque recusar um documento legítimo é pior
 *   que aceitar um grande; o objetivo é só que não exista entrada ilimitada.
 * - **`.passthrough()` em todo objeto**: campo desconhecido passa intacto. A
 *   rota devolve o `documentData` que a extensão guarda; descartar um campo que
 *   uma versão mais nova do servidor acrescentou seria perder dado em silêncio.
 * - **Citações e campos de auditoria com padrão** (`quotes` → `[]`,
 *   `roleSource` → `'unknown'`, `confidence` → `'low'`, `agreement` vazio):
 *   documentos salvos por versões antigas podem não trazê-los, e nenhum deles é
 *   lido pelo render. Ausência não é motivo para recusar a resposta da pessoa.
 *
 * O tipo de saída é conferido contra `DocumentData` pela anotação de
 * `documentDataSchema`: se a interface mudar e o schema não, o typecheck falha.
 */
import { z } from 'zod';
import type { DocumentData } from './documentData';
import { listaComTeto } from './listaComTeto';

/** Nome, cargo, data, título curto. */
const CURTO = 1_000;
/** Frase, resumo de trecho, ação. */
const TEXTO = 20_000;
/** Itens por lista (participantes, decisões, trechos...). */
const ITENS = 500;
/** Citações por afirmação. */
const CITACOES = 100;
/** Seções no `generic` (templates sem estrutura própria). */
const SECOES = 50;

const curto = z.string().max(CURTO);
const texto = z.string().max(TEXTO);

const ancora = z
  .object({ start: z.number().int().min(0), end: z.number().int().min(0), exact: z.boolean() })
  .passthrough();

const citacao = z.object({ quote: texto, anchor: ancora.nullable() }).passthrough();
const citacoes = listaComTeto(citacao, CITACOES).default([]);

const comCitacoes = z.object({ text: texto, quotes: citacoes }).passthrough();

const participante = z
  .object({
    name: curto,
    role: curto.optional(),
    roleSource: z.enum(['meeting', 'user', 'unknown']).default('unknown'),
    atuacao: texto.optional(),
    quotes: citacoes,
  })
  .passthrough();

const encaminhamento = z
  .object({ acao: texto, responsavel: curto.optional(), prazo: curto.optional(), quotes: citacoes })
  .passthrough();

const topico = z.object({ title: curto, summary: texto, quotes: citacoes }).passthrough();

const decisao = z
  .object({
    text: texto,
    agreement: citacao.default({ quote: '', anchor: null }),
    confidence: z.enum(['high', 'medium', 'low']).default('low'),
    quotes: citacoes,
  })
  .passthrough();

const par = z
  .object({
    pergunta: texto.optional(),
    quotesPergunta: citacoes,
    resposta: texto.optional(),
    quotesResposta: citacoes,
  })
  .passthrough();

const periodo = z
  .object({ title: curto, start: curto.optional(), end: curto.optional(), summary: texto, quotes: citacoes })
  .passthrough();

const lista = <T extends z.ZodTypeAny>(item: T) => listaComTeto(item, ITENS).optional();

export const documentDataSchema: z.ZodType<DocumentData, z.ZodTypeDef, unknown> = z
  .object({
    metadata: z.object({ date: curto.optional(), projectName: curto.optional() }).passthrough().optional(),
    executiveSummary: lista(comCitacoes),
    generalTopic: z.object({ topic: curto, progress: texto }).passthrough().optional(),
    participants: lista(participante),
    topicsDiscussed: lista(topico),
    decisions: lista(decisao),
    outcomes: lista(comCitacoes),
    outputs: lista(comCitacoes),
    actionItems: lista(encaminhamento),
    openPoints: lista(comCitacoes),
    conclusion: z.object({ text: texto }).passthrough().optional(),
    signature: z.object({ name: curto.optional(), role: curto.optional() }).passthrough().optional(),
    qa: lista(par),
    periods: lista(periodo),
    // Mesma ideia de `listaComTeto` para as chaves: conta antes de validar cada seção.
    generic: z
      .custom<unknown>(
        (valor) => !valor || typeof valor !== 'object' || Object.keys(valor).length <= SECOES,
        { message: `No máximo ${SECOES} seções em "generic".` },
      )
      .pipe(z.record(z.string().max(200), listaComTeto(comCitacoes, ITENS)))
      .optional(),
  })
  .passthrough();
