import { expect, it } from 'vitest';
import { correspondeABusca, porNomeMaisRecentes } from './BuscaDoAcervo';
it('busca palavras sem acentos em campos diferentes, sem alterar o texto', () => {
  expect(correspondeABusca('DECISAO ana', ['Decisão técnica', 'Ana'])).toBe(true);
  expect(correspondeABusca('decisao pedro', ['Decisão técnica', 'Ana'])).toBe(false);
  expect(correspondeABusca(' ', [])).toBe(true);
});

// Decisão de 23/11/2026: Reuniões e Documentos buscam só pelo nome, e a data
// ordena (mais recente primeiro) sem filtrar.
it('acha só pelo nome e ordena do mais recente para o mais antigo, sem mexer na lista', () => {
  const itens = [
    { nome: 'Revisão do orçamento', texto: 'cronograma', em: 2 },
    { nome: 'Cronograma da obra', texto: '', em: 1 },
    { nome: 'Retrospectiva', texto: '', em: 3 },
  ];
  const ids = (q: string) => porNomeMaisRecentes(itens, q, (i) => i.nome, (i) => i.em).map((i) => i.em);
  expect(ids('')).toEqual([3, 2, 1]);
  expect(ids('CRONOGRAMA')).toEqual([1]);
  expect(ids('orcamento')).toEqual([2]);
  expect(itens.map((i) => i.em)).toEqual([2, 1, 3]);
});
