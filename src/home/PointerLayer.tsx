/**
 * O cursor da HOME: uma SETA arredondada no degradê da marca, com a ponta no
 * lugar exato do mouse, e ao lado dela uma onda mínima de quatro barras — o
 * logo do TaqCiti reduzido ao que cabe num cursor.
 *
 * ── Como se chegou a este desenho ──────────────────────────────────────────
 *
 * Desde 23/11/2026 (pedido do usuário) o cursor é da marca. As tentativas,
 * cada uma corrigindo a anterior — e cada uma CONFERIDA em captura de tela:
 *
 *   1. A onda do logo deitada, centrada num ponto branco, com atraso. Não se
 *      lia como cursor: um cursor aponta.
 *   2. A onda inteira do logo (17 barras, 46px) girada como seta, com a ponta
 *      no mouse. Grande demais, e um cursor de barras não tem silhueta de
 *      seta: o olho não acha a ponta.
 *   3. Cinco barras crescendo a partir da ponta, formando um triângulo. Em
 *      18px aquilo se lia como o ícone de "play" virado para a direita.
 *   4. Agora: a silhueta que todo mundo reconhece como cursor — a seta —, com
 *      contorno branco para se ler em fundo claro e escuro, e a marca no que
 *      tem de próprio: o degradê (que corre devagar entre verde, ciano, azul
 *      e violeta) e a onda de barras ao lado da seta.
 *
 * As barras "falam" em laço, baixo. SÓ o clique aumenta a vibração (classe
 * `pressionado`, enquanto o botão está apertado), e a seta afunda um pouco,
 * como um botão. Passar sobre um botão ou sobre o Taq não acelera nada: uma
 * versão acelerava, e o cursor vivia agitado.
 *
 * ── Por que ele aparecia onde não devia ────────────────────────────────────
 *
 * Duas causas, e nenhuma delas era o efeito em si.
 *
 * A primeira: `cursor: none` vivia no CSS incondicionalmente, enquanto a
 * camada desenhada era ligada por JavaScript. As duas coisas podiam discordar.
 * Levar o mouse para a barra do navegador, trocar de aba e voltar, ou sair pela
 * borda sem gerar o evento esperado deixava a página com `cursor: none` e sem
 * desenho nenhum — um cursor invisível. Agora a regra é a MESMA chave: o CSS só
 * esconde o cursor nativo enquanto `body.tq-pointer-in` existe (ver
 * `home.css`), então onde não há onda desenhada há o cursor do sistema, e
 * nunca os dois nem nenhum.
 *
 * A segunda: `pointerleave` no `window` não é confiável. Ele não dispara ao
 * passar para a UI do navegador, nem quando a aba perde visibilidade com o
 * ponteiro parado dentro dela — e o desenho ficava congelado na última
 * posição, aceso, para sempre. Por isso a saída é observada por quatro
 * caminhos diferentes (ver `desligar` abaixo), e a volta sempre reposiciona
 * antes de acender, para não piscar no lugar velho.
 *
 * ── A regra que não pode ser quebrada ──────────────────────────────────────
 *
 *   - **Nada tem atraso.** A ponta da seta fica exatamente onde o mouse está.
 *     Quem mira um botão mira pela ponta; qualquer interpolação ali vira
 *     imprecisão.
 *   - **Nada disso captura evento.** `pointer-events: none` na camada.
 *   - **Some no toque.** Em `pointer: coarse` não existe cursor para
 *     acompanhar, e um evento de toque desliga a camada.
 *   - **O campo é do sistema.** Sobre `input`, `textarea`, `select` e área
 *     editável a onda SAI INTEIRA e volta o I-beam do sistema (ver home.css).
 *     Uma versão anterior deixava a onda ali, menor, por cima do I-beam e da
 *     barra de digitação — o clique para digitar perdia a precisão e a barra
 *     piscava debaixo das barras da onda.
 *
 * ── O brilho verde pertence ao campo de escrita, e a mais nada ─────────────
 *
 * Existe UM brilho verde, e ele acende exclusivamente dentro da área marcada
 * com `data-tq-escrita`. Sobre o que é do Taq (a resposta, a marca,
 * `data-tq-ia`) o cursor fica no violeta das ideias — só a cor muda.
 *
 * `prefers-reduced-motion` para tudo: a cor fica no degradê fixo, as barras
 * não falam e o clique não vibra.
 */
import { useEffect, useRef, type CSSProperties } from 'react';

interface Props {
  /** Quando falso, o cursor não muda de cor, não fala nem vibra no clique. */
  comMovimento: boolean;
}

/**
 * A seta, no `viewBox` 24×21: ponta em (1,6; 1,6) — o ponto quente —, as duas
 * abas e o entalhe com cantos arredondados (`Q`). O contorno branco é traço
 * com `paint-order: stroke` (home.css), então ele fica por FORA do degradê.
 */
const SETA =
  'M1.6 1.6 L13.6 6.4 Q14.6 6.9 13.6 7.4 L8.6 9.2 Q8.2 9.4 8 9.8 L6.3 14.6 Q5.9 15.6 5.4 14.6 Z';

/**
 * A onda ao lado da seta: [centro x, altura], centradas em y = 16. Médio,
 * alto, médio, baixo — a crista do logo em quatro barras.
 */
const BARRAS: ReadonlyArray<readonly [number, number]> = [
  [14.2, 3.2],
  [16.6, 6.4],
  [19, 4.4],
  [21.4, 2.4],
];

const CONTROLES = 'button, a, summary, [role="button"], [role="tab"], label';
/** Onde o Taq fala: a resposta, a marca e o que estiver marcado como dele. */
const AREAS_DO_TAQ = '.tq-turno-agente, .tq-marca, [data-tq-ia]';
/**
 * Onde se digita. O MESMO conjunto de `home.css`, que devolve o cursor nativo
 * nesses campos — o I-beam e a alça de redimensionar do `textarea` são
 * informação que a onda desenhada não substitui.
 */
const CAMPOS =
  'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

export function PointerLayer({ comMovimento }: Props) {
  const ondaRef = useRef<HTMLDivElement | null>(null);
  const comMovimentoRef = useRef(comMovimento);
  comMovimentoRef.current = comMovimento;

  useEffect(() => {
    const onda = ondaRef.current;
    if (!onda) return;

    const mouse = { x: -100, y: -100 };
    let dentro = false;
    let quadro = 0;
    let ultimoAlvo: Element | null = null;

    const posicionar = () => {
      onda.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
    };

    // Um quadro por vez: o mouse manda mais eventos do que a tela pinta, e
    // escrever o `transform` a cada um é trabalho jogado.
    const passo = () => {
      quadro = 0;
      posicionar();
    };

    const acordar = () => {
      if (!quadro) quadro = requestAnimationFrame(passo);
    };

    /**
     * Apaga a camada e para o laço.
     *
     * Parar o laço sem apagar é exatamente o "desenho preso na tela": ele
     * fica no último lugar, aceso, sem ninguém para movê-lo. E como o CSS
     * amarra `cursor: none` a esta mesma classe, apagá-la devolve o cursor do
     * sistema no mesmo instante.
     */
    const desligar = () => {
      if (!dentro) return;
      dentro = false;
      if (quadro) {
        cancelAnimationFrame(quadro);
        quadro = 0;
      }
      onda.classList.remove('pressionado');
      document.body.classList.remove('tq-pointer-in');
    };

    const aoMover = (e: PointerEvent) => {
      // Um toque não tem ponteiro para acompanhar — e numa tela híbrida ele
      // chega no mesmo listener do mouse.
      if (e.pointerType === 'touch') {
        desligar();
        return;
      }
      // Diálogos modais (visualizador de imagem, por exemplo) ficam fora do
      // cursor desenhado: o overlay cobre a camada e `cursor: none` apagaria
      // o cursor nativo, deixando o "Baixar" sem cursor nenhum.
      if ((e.target as Element | null)?.closest?.('[role="dialog"]')) {
        desligar();
        return;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!dentro) {
        // Reposiciona ANTES de acender: sem isto, voltar para a janela pinta
        // um quadro no lugar de onde o ponteiro saiu.
        posicionar();
        dentro = true;
        document.body.classList.add('tq-pointer-in');
      }

      /*
       * Os sinais, em ordem de prioridade: "isto é onde se escreve" (verde),
       * "isto é clicável" (nada muda — e por isso o Taq dentro de um botão
       * não fica violeta), "isto é o Taq" (violeta). `closest` cobre o alvo
       * ser filho do elemento marcado.
       *
       * Só recalcula quando o alvo MUDA: o mouse passa dezenas de eventos
       * sobre o mesmo elemento, e subir a árvore a cada um é trabalho jogado.
       */
      const alvo = e.target as Element | null;
      if (alvo !== ultimoAlvo) {
        ultimoAlvo = alvo;
        const naEscrita = !!alvo?.closest?.('[data-tq-escrita]');
        const noControle = !naEscrita && !!alvo?.closest?.(CONTROLES);
        const noTaq = !naEscrita && !noControle && !!alvo?.closest?.(AREAS_DO_TAQ);
        // Campo de texto: o I-beam volta (ver home.css) e o desenho sai
        // inteiro, para nada ficar por cima do clique nem da barra de
        // digitação.
        const noCampo = !!alvo?.closest?.(CAMPOS);
        onda.classList.toggle('sobre-escrita', naEscrita);
        onda.classList.toggle('sobre-campo', noCampo);
        onda.classList.toggle('sobre-taq', noTaq);
      }
      acordar();
    };

    /**
     * Saiu para fora do documento.
     *
     * `relatedTarget === null` num `pointerout` é o Chrome dizendo "o ponteiro
     * não foi para outro elemento, foi para fora" — inclusive para a barra do
     * navegador, que é o caso que o `pointerleave` do `window` não cobria.
     */
    const aoSairDoDocumento = (e: PointerEvent) => {
      if (e.relatedTarget === null) desligar();
    };
    const aoPerderVisibilidade = () => {
      if (document.hidden) desligar();
    };

    // O ÚNICO momento em que a vibração aumenta: enquanto o botão está
    // apertado. Soltar (ou o navegador cancelar o gesto) devolve a calma.
    const aoPressionar = () => {
      if (!comMovimentoRef.current) return;
      onda.classList.add('pressionado');
    };
    const aoSoltar = () => {
      onda.classList.remove('pressionado');
    };

    window.addEventListener('pointermove', aoMover, { passive: true });
    // Os quatro caminhos de saída. Nenhum deles sozinho é confiável.
    document.addEventListener('pointerout', aoSairDoDocumento);
    document.documentElement.addEventListener('pointerleave', desligar);
    window.addEventListener('blur', desligar);
    document.addEventListener('visibilitychange', aoPerderVisibilidade);
    window.addEventListener('pointerdown', aoPressionar, { passive: true });
    window.addEventListener('pointerup', aoSoltar, { passive: true });
    window.addEventListener('pointercancel', aoSoltar, { passive: true });

    return () => {
      window.removeEventListener('pointermove', aoMover);
      document.removeEventListener('pointerout', aoSairDoDocumento);
      document.documentElement.removeEventListener('pointerleave', desligar);
      window.removeEventListener('blur', desligar);
      document.removeEventListener('visibilitychange', aoPerderVisibilidade);
      window.removeEventListener('pointerdown', aoPressionar);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      // A classe é global: deixá-la para trás numa desmontagem esconderia o
      // cursor do sistema sem nada no lugar.
      document.body.classList.remove('tq-pointer-in');
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    // `data-movimento`, e não uma classe: o efeito liga e desliga classes
    // neste mesmo elemento, e um `className` do React as apagaria a cada
    // renderização.
    <div
      ref={ondaRef}
      className="tq-halo"
      data-movimento={comMovimento ? 'sim' : 'nao'}
      aria-hidden="true"
    >
      <div className="tq-rotor">
        <svg
          className="tq-cursor-desenho"
          viewBox="0 0 24 21"
          shapeRendering="geometricPrecision"
          focusable="false"
        >
          <defs>
            {/* Ids fixos: só existe uma camada de cursor por página. As duas
                paradas de `tq-cursor-marca` têm classe porque o CSS as anima
                (a cor que corre); os valores aqui são o repouso sem movimento. */}
            <linearGradient id="tq-cursor-marca" gradientUnits="userSpaceOnUse" x1="1" y1="1" x2="22" y2="19">
              <stop className="tq-cursor-cor-a" offset="0" stopColor="#3ddc2e" />
              <stop className="tq-cursor-cor-b" offset="1" stopColor="#1a7fea" />
            </linearGradient>
            <linearGradient id="tq-cursor-ideia" gradientUnits="userSpaceOnUse" x1="1" y1="1" x2="22" y2="19">
              <stop offset="0" stopColor="#c4b5ff" />
              <stop offset="1" stopColor="#7b5cf0" />
            </linearGradient>
          </defs>
          <path className="tq-cursor-seta" d={SETA} />
          {BARRAS.map(([x, altura], i) => (
            <rect
              key={x}
              className="tq-cursor-barra"
              x={x - 0.8}
              y={16 - altura / 2}
              width={1.6}
              height={altura}
              rx={0.8}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
