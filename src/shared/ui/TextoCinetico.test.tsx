/**
 * A transcrição cinética, com a forma REAL das atualizações do Meet: cada uma
 * traz a fala inteira de novo (cresce, corrige acento, reescreve o fim).
 *
 * O que se fixa aqui é a regra que torna o efeito suportável numa reunião de
 * uma hora: palavra que já estava não reanima, só a nova entra; o texto na tela
 * é sempre exatamente o recebido; e o que assentou vira texto corrido.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSENTADA_MS, TextoCinetico } from './TextoCinetico';
import { intervaloDoLote, proximaVersao, versaoInicial } from './diffDePalavras';

describe('o diff por palavra', () => {
  it('a fala que cresce: só a palavra de fora é nova, as de antes mantêm o id', () => {
    const v1 = versaoInicial('bom dia', 0, false);
    const v2 = proximaVersao(v1, 'bom dia pessoal', 100);
    expect(v2.palavras.map((p) => p.id).slice(0, 2)).toEqual(v1.palavras.map((p) => p.id));
    expect(v2.palavras.map((p) => p.chegada)).toEqual([null, null, 'nova']);
  });

  it('acento e pontuação corrigidos não são palavra nova: mesmo id, texto novo', () => {
    const v1 = versaoInicial('o orcamento', 0, false);
    const v2 = proximaVersao(v1, 'o orçamento.', 100);
    expect(v2.palavras[1]!.id).toBe(v1.palavras[1]!.id);
    expect(v2.palavras[1]!.texto).toBe('orçamento.');
    expect(v2.palavras[1]!.chegada).toBeNull();
  });

  it('o fim reescrito: a palavra trocada é correção, a que sobra é entrada', () => {
    const v1 = versaoInicial('vamos falar sobre', 0, false);
    const v2 = proximaVersao(v1, 'vamos falar sob o', 100);
    expect(v2.palavras.map((p) => [p.texto, p.chegada])).toEqual([
      ['vamos', null],
      ['falar', null],
      ['sob', 'troca'],
      ['o', 'nova'],
    ]);
  });

  it('palavra corrigida no MEIO não reanima o que vem depois', () => {
    const v1 = versaoInicial('a gente fecha o escopo hoje', 0, false);
    const v2 = proximaVersao(v1, 'a gente fechou o escopo hoje', 100);
    const mudaram = v2.palavras.filter((p) => p.chegada).map((p) => p.texto);
    expect(mudaram).toEqual(['fechou']);
    expect(v2.palavras.at(-1)!.id).toBe(v1.palavras.at(-1)!.id);
  });

  it('várias palavras de uma vez entram escalonadas, com teto', () => {
    const v1 = versaoInicial('então', 0, false);
    const v2 = proximaVersao(v1, 'então vamos fechar o escopo da entrega hoje à tarde', 100);
    const atrasos = v2.palavras.filter((p) => p.chegada === 'nova').map((p) => p.atraso);
    expect(atrasos[0]).toBe(0);
    // Crescente, e a última nunca espera mais que ~220ms.
    expect([...atrasos].sort((a, b) => a - b)).toEqual(atrasos);
    expect(atrasos.at(-1)!).toBeLessThanOrEqual(230);
    expect(intervaloDoLote(3)).toBe(36);
  });

  it('o mesmo texto devolve a mesma versão (renderização dupla não gera ids)', () => {
    const v1 = versaoInicial('bom dia', 0, true);
    expect(proximaVersao(v1, 'bom dia', 50)).toBe(v1);
  });

  it('a fidelidade: os espaços e a ordem são os do original', () => {
    const texto = '  bom   dia,\tpessoal ';
    const v = proximaVersao(versaoInicial('bom', 0, false), texto, 10);
    expect(v.palavras.map((p) => p.antes + p.texto).join('') + v.final).toBe(texto);
  });
});

describe('o componente', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const render = (texto: string, extra: { vivo?: boolean; animarInicio?: boolean } = {}) =>
    act(() => root.render(<TextoCinetico texto={texto} {...extra} />));
  const palavras = () => [...host.querySelectorAll<HTMLElement>('.tq-cin-p')];

  it('a palavra que já estava é o MESMO elemento depois da atualização', () => {
    render('bom dia', { vivo: true, animarInicio: true });
    const [bom] = palavras();
    render('bom dia pessoal', { vivo: true });
    expect(palavras()[0]).toBe(bom);
    expect(palavras().map((p) => p.className.includes('nova'))).toEqual([true, true, true]);
    expect(host.textContent).toBe('bom dia pessoal');
  });

  it('o que estava na tela ao montar não entra animado', () => {
    render('fala antiga já transcrita');
    expect(host.querySelector('.nova')).toBeNull();
    render('fala antiga já transcrita e continua', { vivo: true });
    expect(palavras().filter((p) => p.classList.contains('nova')).map((p) => p.textContent)).toEqual([
      'e',
      'continua',
    ]);
  });

  it('a ponta recente fica provisória e assenta quando a fala para', () => {
    render('bom dia', { vivo: true, animarInicio: true });
    expect(host.querySelectorAll('.provisoria').length).toBe(2);
    act(() => vi.advanceTimersByTime(ASSENTADA_MS + 50));
    expect(host.querySelector('.provisoria')).toBeNull();
    // Assentou: vira texto corrido, sem span nenhum, com o mesmo texto.
    expect(palavras()).toHaveLength(0);
    expect(host.textContent).toBe('bom dia');
  });

  it('com movimento reduzido o texto aparece de imediato, sem palavras animadas', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as typeof window.matchMedia;
    try {
      render('bom dia pessoal', { vivo: true, animarInicio: true });
      expect(palavras()).toHaveLength(0);
      expect(host.textContent).toBe('bom dia pessoal');
    } finally {
      window.matchMedia = original;
    }
  });
});
