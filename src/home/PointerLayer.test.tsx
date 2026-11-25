/**
 * O cursor desenhado, e as quatro maneiras de sair da janela.
 *
 * O que se observa é a classe `tq-pointer-in` no `body`, porque ela é o
 * contrato inteiro: enquanto ela existe há ponto desenhado e o CSS esconde o
 * cursor do sistema; sem ela é o contrário. Um ponto "preso na tela" é
 * exatamente esta classe tendo sobrado.
 *
 * `pointerleave` no `window` sozinho não cobria nenhum destes casos — era a
 * causa do desenho ficando congelado no último lugar.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PointerLayer } from './PointerLayer';

let host: HTMLDivElement;
let root: Root;

const aceso = () => document.body.classList.contains('tq-pointer-in');

function mover(x = 40, y = 40, pointerType = 'mouse') {
  window.dispatchEvent(
    new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType }),
  );
}

async function montar() {
  await act(async () => {
    root.render(<PointerLayer comMovimento />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.classList.remove('tq-pointer-in');
  vi.unstubAllGlobals();
});

describe('a camada acende com o ponteiro', () => {
  it('nasce apagada e acende ao primeiro movimento', async () => {
    await montar();
    expect(aceso()).toBe(false);

    await act(async () => mover());
    expect(aceso()).toBe(true);
  });

  it('um toque não acende cursor nenhum', async () => {
    await montar();
    await act(async () => mover(40, 40, 'touch'));
    expect(aceso()).toBe(false);
  });
});

describe('as quatro saídas', () => {
  it.each([
    [
      'sair do documento (inclusive para a barra do navegador)',
      () =>
        document.dispatchEvent(
          new PointerEvent('pointerout', { bubbles: true, relatedTarget: null }),
        ),
    ],
    [
      'sair pela borda da página',
      () => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')),
    ],
    ['a janela perder o foco', () => window.dispatchEvent(new Event('blur'))],
    [
      'a aba deixar de estar visível',
      () => {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      },
    ],
  ])('apaga ao %s', async (_nome, sair) => {
    await montar();
    await act(async () => mover());
    expect(aceso()).toBe(true);

    await act(async () => {
      sair();
    });
    expect(aceso()).toBe(false);
  });

  it('volta a acender quando o ponteiro retorna', async () => {
    await montar();
    await act(async () => mover());
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(aceso()).toBe(false);

    await act(async () => mover(120, 90));
    expect(aceso()).toBe(true);
  });

  /* Desmontar sem limpar deixaria a página com `cursor: none` e nada no lugar. */
  it('desmontar não deixa a classe para trás', async () => {
    await montar();
    await act(async () => mover());
    expect(aceso()).toBe(true);

    await act(async () => root.unmount());
    expect(aceso()).toBe(false);

    // O `afterEach` desmonta de novo; com a raiz já desmontada isso lançaria.
    root = createRoot(host);
  });
});

describe('o cursor responde ao que está embaixo dele', () => {
  function moverSobre(el: Element) {
    el.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse', bubbles: true }),
    );
  }

  /* No campo o I-beam do sistema volta e a onda sai inteira (home.css), para
     nada ficar por cima do clique nem da barra de digitação. */
  it('sobre um campo de texto a onda marca que deve sair', async () => {
    await montar();
    const campo = document.createElement('textarea');
    document.body.append(campo);
    await act(async () => moverSobre(campo));
    expect(host.querySelector('.tq-halo')!.classList.contains('sobre-campo')).toBe(true);
    campo.remove();
  });

  /* A reação de IA é contextual: só sobre o que é do Taq (a onda fica
     violeta no CSS), e sai ao sair dele. */
  it('sobre a resposta do Taq a onda muda de estado, e volta ao sair', async () => {
    await montar();
    const resposta = document.createElement('div');
    resposta.className = 'tq-turno-agente';
    const p = document.createElement('p');
    resposta.append(p);
    const fora = document.createElement('div');
    document.body.append(resposta, fora);
    const anel = host.querySelector<HTMLElement>('.tq-halo')!;

    await act(async () => moverSobre(p));
    expect(anel.classList.contains('sobre-taq')).toBe(true);

    await act(async () => moverSobre(fora));
    expect(anel.classList.contains('sobre-taq')).toBe(false);
    resposta.remove();
    fora.remove();
  });
});

/*
 * Desde 23/11/2026 o cursor é o logo do TaqCiti: a onda de barras, sem a
 * bolinha. Sem movimento (`prefers-reduced-motion`) ela fica parada no
 * desenho do logo — o CSS só anima com `data-movimento="sim"`.
 */
describe('o cursor tem a forma do logo', () => {
  /* Uma seta (a silhueta que se reconhece como cursor) e a onda mínima do
     logo ao lado. Só barras, sem seta, se lia como "play" em tamanho real. */
  it('desenha a seta e a onda de quatro barras', async () => {
    await montar();
    expect(host.querySelectorAll('.tq-cursor-seta')).toHaveLength(1);
    expect(host.querySelectorAll('.tq-cursor-barra')).toHaveLength(4);
  });

  /* A cor que muda é a das paradas do degradê; o CSS as anima pela classe. */
  it('o degradê tem as paradas que o CSS anima', async () => {
    await montar();
    expect(host.querySelector('#tq-cursor-marca .tq-cursor-cor-a')).not.toBeNull();
    expect(host.querySelector('#tq-cursor-marca .tq-cursor-cor-b')).not.toBeNull();
  });

  it('não desenha mais a bolinha', async () => {
    await montar();
    expect(host.querySelector('.tq-dot')).toBeNull();
  });

  /* A vibração só aumenta no clique, enquanto o botão está apertado. */
  it('o clique aumenta a vibração, e soltar a devolve ao repouso', async () => {
    await montar();
    const onda = host.querySelector('.tq-halo')!;
    await act(async () => mover());
    await act(async () => window.dispatchEvent(new PointerEvent('pointerdown')));
    expect(onda.classList.contains('pressionado')).toBe(true);
    await act(async () => window.dispatchEvent(new PointerEvent('pointerup')));
    expect(onda.classList.contains('pressionado')).toBe(false);
  });

  it('sem movimento, o clique não vibra', async () => {
    await act(async () => {
      root.render(<PointerLayer comMovimento={false} />);
    });
    await act(async () => window.dispatchEvent(new PointerEvent('pointerdown')));
    expect(host.querySelector('.tq-halo')!.classList.contains('pressionado')).toBe(false);
  });

  it('a fala da onda segue a preferência de movimento', async () => {
    await montar();
    expect(host.querySelector('.tq-halo')!.getAttribute('data-movimento')).toBe('sim');
    await act(async () => {
      root.render(<PointerLayer comMovimento={false} />);
    });
    expect(host.querySelector('.tq-halo')!.getAttribute('data-movimento')).toBe('nao');
  });
});

describe('a onda não tem atraso', () => {
  /* A ponta da onda é o alvo: qualquer interpolação ali vira imprecisão. */
  it('a ponta vai para a posição exata do mouse', async () => {
    await montar();
    await act(async () => mover(200, 150));

    const onda = host.querySelector<HTMLElement>('.tq-halo');
    expect(onda?.style.transform).toBe('translate(200px, 150px)');
  });

  /*
   * Na primeira entrada a onda é reposicionada antes de acender: sem isso ela
   * nasceria na posição de onde o ponteiro saiu da última vez.
   */
  it('a onda não atravessa a tela ao reentrar', async () => {
    await montar();
    await act(async () => mover(200, 150));
    await act(async () => window.dispatchEvent(new Event('blur')));
    await act(async () => mover(600, 400));

    const anel = host.querySelector<HTMLElement>('.tq-halo');
    expect(anel?.style.transform).toContain('translate(600px, 400px)');
  });
});
