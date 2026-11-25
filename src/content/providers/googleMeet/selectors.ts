/**
 * TODOS os seletores do DOM do Google Meet vivem aqui — este é o ponto frágil
 * da integração e o primeiro lugar a olhar quando o Meet mudar o layout.
 * Cada grupo é uma lista ordenada de fallbacks: o primeiro que casar, vence.
 */

/** Botão de sair — presença dele define "estou dentro de uma chamada". */
export const LEAVE_CALL_SELECTORS = [
  'button[aria-label*="leave call" i]',
  'button[aria-label*="sair da chamada" i]',
  'button[aria-label*="end call" i]',
  'button[aria-label*="encerrar chamada" i]',
  'button[aria-label*="salir de la llamada" i]',
  'button[aria-label*="leave meeting" i]',
  'button[aria-label*="sair da reunião" i]',
  'button[aria-label*="sair da reuniao" i]',
  '[role="button"][aria-label*="sair da chamada" i]',
  '[role="button"][aria-label*="leave call" i]',
  'button[data-tooltip*="sair da chamada" i]',
  'button[data-tooltip*="leave call" i]',
  '[jsname="CQylAd"]',
];

/**
 * A tela depois da chamada ("Você saiu da reunião"). A URL continua a mesma
 * nela, então é o DOM que decide — e o botão de sair pode continuar no
 * documento, escondido. Estes botões são o sinal POSITIVO de fim: presentes,
 * a chamada acabou, haja o que houver escondido na página.
 */
export const CALL_ENDED_BUTTON_TEXT =
  /^(rejoin|participar novamente|voltar à tela inicial|voltar para a tela inicial|return to home screen)$/i;

/** O seletor amplo também pegava "Idioma das legendas" e abria o menu a cada
 * tentativa de ligar a captura. Só ações de ligar/desligar são candidatas. */
export const CAPTIONS_TOGGLE_SELECTORS = [
  'button[aria-label*="legenda" i][aria-pressed]',
  'button[aria-label*="caption" i][aria-pressed]',
  'button[aria-label*="ativar legendas" i]',
  'button[aria-label*="turn on captions" i]',
  'button[aria-label*="turn off captions" i]',
  'button[aria-label*="enable captions" i]',
  'button[aria-label*="disable captions" i]',
  // Layout de 11/2026: o liga/desliga mora DENTRO do painel "Legendas e
  // tradução" ("Ativar legendas" / "Desativar legenda instantânea").
  'button[aria-label*="legenda instantânea" i]',
  'button[aria-label*="live captions" i]',
  '[jsname="RrG0hf"]',
  '[jsname="r8qRAd"]',
];

/**
 * Layout de 11/2026 (visto ao vivo em 24/11/2026): a barra da chamada não tem
 * mais o liga/desliga das legendas, só "Legendas e tradução", que abre um
 * painel (`aria-haspopup="dialog"`). O botão de ligar só existe com o painel
 * aberto, e `queryCaptionsToggle` recusa `aria-haspopup` de propósito — então
 * a extensão não achava o que clicar e as legendas nunca ligavam sozinhas.
 * O `aria-pressed` deste botão acompanha a legenda: `true` = ligada.
 */
const CAPTIONS_MENU_SELECTORS = [
  'button[aria-haspopup="dialog"][aria-label*="legenda" i]',
  'button[aria-haspopup="dialog"][aria-label*="caption" i]',
];

export function queryCaptionsMenu(): HTMLElement | null {
  for (const selector of CAPTIONS_MENU_SELECTORS) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      // "Abrir configurações de legenda" também abre um dialog.
      if (/idioma|language|settings|configura/i.test(el.getAttribute('aria-label') ?? '')) continue;
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
      return el;
    }
  }
  return null;
}

/**
 * "Idioma da reunião": o idioma em que o Meet ESCREVE a legenda. Só aparece
 * com a legenda ligada, junto da região de legenda. É um combobox cujas opções
 * (`li[role=option]`) carregam o código no `data-value` (`pt-BR`, `en-US`…) e
 * ficam no DOM mesmo com a lista fechada.
 */
export const MEETING_LANGUAGE_COMBOBOX_SELECTORS = [
  '[role="combobox"][aria-label*="idioma" i]',
  '[role="combobox"][aria-label*="language" i]',
  '[role="combobox"][jsname="oYxtQd"]',
];
export const MEETING_LANGUAGE_LISTBOX_SELECTORS = [
  '[role="listbox"][aria-label*="idioma" i]',
  '[role="listbox"][aria-label*="language" i]',
  '[role="listbox"][jsname="rymPhb"]',
];
/** O idioma que a extensão escolhe para a legenda (decisão do usuário, 24/11/2026). */
export const IDIOMA_DA_LEGENDA = 'pt-BR';

/** O Meet pode conservar botões de um layout anterior, escondidos. */
export function queryCaptionsToggle(): HTMLElement | null {
  for (const selector of CAPTIONS_TOGGLE_SELECTORS) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.matches('[disabled], [aria-disabled="true"], [aria-haspopup]')) continue;
      if (/idioma|language|settings|configura/i.test(el.getAttribute('aria-label') ?? '')) continue;
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
      return el;
    }
  }
  return null;
}

/** Região onde as legendas são renderizadas (só existe com legendas ligadas). */
export const CAPTION_REGION_SELECTORS = [
  'div[role="region"][aria-label*="caption" i]',
  'div[role="region"][aria-label*="legenda" i]',
  '.a4cQT',
];

/** Estruturas conhecidas de linha de legenda: { linha, nome do falante, texto }. */
export const CAPTION_LINE_SHAPES = [
  { line: '.nMcdL', speaker: '.KcIKyf', text: '.bh44bd' },
  { line: '.TBMuR', speaker: '.zs7s8d', text: '[jsname="tgaKEf"]' },
] as const;

/** Tiles de vídeo com participantes (nome quando o Meet expõe). */
export const PARTICIPANT_TILE_SELECTOR =
  '[data-participant-id], [role="listitem"][data-user-id], [role="listitem"][data-participant-name]';
export const PARTICIPANT_NAME_SELECTORS = [
  '[data-self-name]',
  '[data-participant-name]',
  '.zWGUib',
  '.XEazBc',
  '.notranslate',
];

/**
 * A PRÓPRIA pessoa: o Meet marca o tile/nó dela com `data-self-name`. O valor do
 * atributo (ou o texto do nó) é o nome real — a chave para trocar "Você" pelo
 * nome e para saber quem é o anfitrião ("Eu"). Lista de fallbacks: o 1º vence.
 */
export const SELF_NAME_SELECTORS = ['[data-self-name]', '[data-self-name] *'];

/** URL de reunião: meet.google.com/abc-defg-hij — ver `features/meeting/sala.ts`. */

export function queryFirst(
  root: ParentNode,
  selectors: readonly string[],
): Element | null {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}
