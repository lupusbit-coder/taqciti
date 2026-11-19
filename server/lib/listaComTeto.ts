/**
 * Lista zod que recusa pelo TAMANHO antes de validar item por item.
 *
 * No zod 3 em uso, `z.array(item).max(N)` valida CADA item antes de olhar o
 * `.max()`: o teto acusa o excesso, mas só depois de pagar por todos os itens.
 * Medido em 11/2026: um corpo de 4,4 MB com `blocos: [{}, {}, ...]` custou ~7 s
 * de CPU e ~770 MB de memória em `/api/documentos/renderizar` antes da recusa —
 * cada `{}` inválido gera várias issues, com caminho e mensagem.
 *
 * Aqui a primeira etapa só confere `Array.isArray` e `length` (custo constante);
 * se passar do teto, a validação para ali e a segunda etapa nem roda (no zod 3,
 * o `pipe` não segue quando a primeira etapa falha). Valor que não é lista
 * passa direto para a segunda etapa, que dá o erro de tipo de sempre.
 */
import { z } from 'zod';

/**
 * Orçamento de NÓS de um JSON já parseado (cada lista, objeto e valor conta 1).
 *
 * `listaComTeto` limita cada nível, não o total: 3.000 linhas × 40 células
 * inválidas passam nível a nível e custaram 2,1 s, 747 MB e 2 milhões de
 * issues (corpo de 4,2 MB); no `documentData`, 9 listas × 500 itens × 100
 * citações `{}` custaram 1 s e 903 mil issues (1,46 MB). Contar os nós antes do
 * `safeParse` é uma passada linear, sem alocar issue nenhuma, e para assim que
 * passa do orçamento (a pilha nunca guarda mais que o orçamento).
 *
 * 250 mil cobre o pior documento que o schema aceita: no máximo 100 mil
 * células na árvore (orçamento de `contentTreeSchema`), cada uma um nó; no pior
 * caso cada célula numa linha própria (tabelas de 1 coluna), mais 100 mil
 * listas de linha; e uns 10 nós por bloco nos 3.000 blocos (objeto, campos,
 * fontes), 30 mil — ~230 mil. Um documento real fica muito abaixo, e um
 * `documentData` real (dezenas de participantes, decisões e citações) em
 * poucos milhares. Os ataques medidos acima têm milhões de nós.
 */
export const ORCAMENTO_DE_NOS = 250_000;

/** `true` quando `valor` tem mais de `orcamento` nós. */
export function excedeOrcamentoDeNos(valor: unknown, orcamento = ORCAMENTO_DE_NOS): boolean {
  const pilha: unknown[] = [valor];
  let nos = 1;
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === null || typeof atual !== 'object') continue;
    const filhos = Array.isArray(atual) ? atual : Object.values(atual);
    nos += filhos.length;
    if (nos > orcamento) return true;
    for (const filho of filhos) pilha.push(filho);
  }
  return false;
}

export function listaComTeto<T extends z.ZodTypeAny>(item: T, max: number, min = 0) {
  return z
    .custom<unknown>((valor) => !Array.isArray(valor) || valor.length <= max, {
      message: `No máximo ${max} itens.`,
    })
    .pipe(z.array(item).min(min).max(max));
}
