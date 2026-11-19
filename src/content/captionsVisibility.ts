/**
 * Controle de visibilidade das legendas NATIVAS do Meet.
 *
 * O truque central da captura invisível: as legendas precisam estar LIGADAS
 * para o Meet popular o DOM com as falas, mas não precisam aparecer na tela.
 * O motor de legendas continua escrevendo no DOM e o MutationObserver segue
 * capturando tudo, sem nada cobrindo o vídeo.
 *
 * POR QUE NÃO BASTA `opacity: 0`. Era o que este arquivo fazia, e o efeito
 * colateral aparecia na hora: os rostos encolhiam e sobrava uma faixa preta
 * enorme embaixo. `opacity` pinta, não mede — o elemento continua ocupando a
 * altura dele, e o Meet dimensiona a grade de vídeo pelo espaço que sobra. O
 * resultado é o pior dos dois mundos: a legenda some e o buraco fica.
 *
 * A correção tira a região do FLUXO (`position: fixed` + tamanho ~zero), o que
 * devolve a altura inteira para os vídeos. O elemento continua no documento e
 * continua sendo renderizado — `display: none` também resolveria o espaço, mas
 * desliga o pipeline de layout do nó e é justamente onde navegador e Meet
 * podem decidir parar de atualizar conteúdo invisível. Aqui ele segue vivo,
 * medindo 1px num canto, escrevendo legenda que ninguém vê.
 *
 * `clip-path` remata o 1px residual sem afetar medida alguma.
 */
import { CAPTION_LINE_SHAPES, CAPTION_REGION_SELECTORS } from './providers/googleMeet/selectors';

const STYLE_ID = 'taqciti-captions-visibility';

/**
 * Regras aplicadas à região de legendas quando ela está oculta.
 *
 * Cada uma existe por um motivo: as três primeiras tiram do fluxo, as de
 * tamanho impedem que um `min-height` do Meet reabra o buraco, e as últimas
 * garantem que o que sobra não seja visto nem clicado.
 */
const REGRAS_OCULTAR = [
  'position: fixed !important',
  'bottom: 0 !important',
  'left: 0 !important',
  'right: auto !important',
  'top: auto !important',
  'width: 1px !important',
  'height: 1px !important',
  'min-height: 0 !important',
  'max-height: 1px !important',
  'min-width: 0 !important',
  'margin: 0 !important',
  'padding: 0 !important',
  'overflow: hidden !important',
  'clip-path: inset(50%) !important',
  'opacity: 0 !important',
  'pointer-events: none !important',
  'user-select: none !important',
  'z-index: -1 !important',
].join('; ');

/**
 * Marca no invólucro que existe SÓ para hospedar a legenda.
 *
 * Em alguns layouts do Meet quem reserva a faixa não é a região de legenda, é
 * um contêiner em volta dela. Colapsar a região por dentro de um pai que
 * continua alto não devolve pixel nenhum.
 *
 * A condição para marcar é estreita de propósito: o pai só é colapsado quando
 * a região de legenda é o ÚNICO filho-elemento dele e não abriga controles.
 * A marca é retirada se o Meet reaproveitar a região. Um pai com mais filhos
 * pode estar segurando controle, aviso ou barra do Meet, e encolhê-lo seria
 * quebrar a chamada para consertar um vão.
 */
const WRAPPER_ATTR = 'data-taqciti-caption-wrapper';
const REGION_ATTR = 'data-taqciti-caption-hidden';
const CONTROLES = 'button, [role="button"], select, input, [role="listbox"], [role="menu"], [role="dialog"], video';
const REGIOES = CAPTION_REGION_SELECTORS.join(',');
const LINHAS = CAPTION_LINE_SHAPES.map(({ line }) => line).join(',');

function marcarInvolucros(): void {
  const ocultos = new Set<Element>();
  const involucros = new Set<Element>();
  for (const region of document.querySelectorAll(REGIOES)) {
    // Alguns layouts abrigam idioma e falas na mesma região. Nesse caso só
    // as linhas conhecidas saem de vista; controles continuam no fluxo.
    if (region.querySelector(CONTROLES)) {
      for (const line of region.querySelectorAll(LINHAS)) {
        if (!line.querySelector(CONTROLES)) ocultos.add(line);
      }
      continue;
    }
    ocultos.add(region);
    const parent = region.parentElement;
    if (parent && parent.childElementCount === 1 &&
        !parent.matches('body, html, main, [role="main"], [role="dialog"], [role="toolbar"]')) {
      involucros.add(parent);
    }
  }
  // O Meet reaproveita contêineres: uma marca antiga não pode encolher uma
  // barra de idioma que foi acrescentada depois. Reconciliar também REMOVE.
  reconciliar(REGION_ATTR, ocultos);
  reconciliar(WRAPPER_ATTR, involucros);
}

function reconciliar(atributo: string, atuais: Set<Element>): void {
  for (const node of document.querySelectorAll(`[${atributo}]`)) {
    if (!atuais.has(node)) node.removeAttribute(atributo);
  }
  for (const node of atuais) {
    if (!node.hasAttribute(atributo)) node.setAttribute(atributo, '');
  }
}

function limparInvolucros(): void {
  reconciliar(WRAPPER_ATTR, new Set());
  reconciliar(REGION_ATTR, new Set());
}

/**
 * A região de legenda só nasce quando o Meet liga as legendas, e pode ser
 * recriada a cada troca de layout. Um observador mantém a marcação em dia
 * enquanto o modo oculto estiver ativo.
 */
let observer: MutationObserver | null = null;
let quadro: number | null = null;

export function setNativeCaptionsHidden(hidden: boolean): void {
  const existing = document.getElementById(STYLE_ID);

  if (!hidden) {
    existing?.remove();
    observer?.disconnect();
    observer = null;
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = null;
    limparInvolucros();
    return;
  }

  if (!existing) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      // :has protege os controles imediatamente, antes do próximo quadro.
      `[${REGION_ATTR}]:not(:has(${CONTROLES})) { ${REGRAS_OCULTAR}; }`,
      `[${WRAPPER_ATTR}]:not(:has(${CONTROLES})) { height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; }`,
    ].join('\n');
    document.head.appendChild(style);
  }

  marcarInvolucros();
  if (observer) return;

  // O DOM do Meet muda dezenas de vezes por segundo durante a chamada (cada
  // linha de legenda, cada tile de vídeo). Reagir a cada mutação faria uma
  // varredura de seletores a cada quadro e apareceria como travada na
  // chamada; um quadro de folga junta a rajada inteira num trabalho só.
  observer = new MutationObserver(() => {
    if (quadro !== null) return;
    quadro = requestAnimationFrame(() => {
      quadro = null;
      marcarInvolucros();
    });
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['role', 'aria-label', 'class'],
  });
}
