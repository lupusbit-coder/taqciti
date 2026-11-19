/**
 * Texto de contagem para a pessoa: plural de verdade e fuso com nome.
 *
 * "compromisso(s)", "vez(es)" e "Fuso: America/Recife" saíam na tela e na
 * atividade do Taq (varredura visual de 11/11/2026). Estes testes fixam a troca.
 */
import { describe, expect, it } from 'vitest';
import { contar, nomeDoFuso } from './format';

describe('contar', () => {
  it('usa o singular só para 1', () => {
    expect(contar(1, 'compromisso', 'compromissos')).toBe('1 compromisso');
    expect(contar(0, 'compromisso', 'compromissos')).toBe('0 compromissos');
    expect(contar(3, 'vez', 'vezes')).toBe('3 vezes');
  });
});

describe('nomeDoFuso', () => {
  it('dá nome de gente ao identificador IANA', () => {
    const nome = nomeDoFuso('America/Recife', Date.UTC(2026, 9, 2));
    expect(nome).toContain('Brasília');
    expect(nome).not.toContain('America/');
  });

  it('id inválido não some: devolve o próprio id', () => {
    expect(nomeDoFuso('Nao/Existe')).toBe('Nao/Existe');
  });
});
