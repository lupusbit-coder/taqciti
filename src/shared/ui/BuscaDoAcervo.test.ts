import { expect, it } from 'vitest';
import { correspondeABusca, dentroDoPeriodo } from './BuscaDoAcervo';
it('busca palavras sem acentos em campos diferentes, sem alterar o texto', () => {
  expect(correspondeABusca('DECISAO ana', ['Decisão técnica', 'Ana'])).toBe(true);
  expect(correspondeABusca('decisao pedro', ['Decisão técnica', 'Ana'])).toBe(false);
  expect(correspondeABusca(' ', [])).toBe(true);
});
it('inclui o dia final inteiro no fuso local e recusa período invertido', () => {
  const instante = new Date(2026, 10, 13, 23, 59).getTime();
  expect(dentroDoPeriodo(instante, '2026-11-13', '2026-11-13')).toBe(true);
  expect(dentroDoPeriodo(instante, '', '2026-11-12')).toBe(false);
  expect(dentroDoPeriodo(instante, '2026-11-14', '2026-11-13')).toBe(false);
});
