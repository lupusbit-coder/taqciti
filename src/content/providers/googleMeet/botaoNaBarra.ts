/**
 * O botão do TaqCiti NA BARRA DE BAIXO do Meet, ao lado de microfone, câmera e
 * "sair" — para parecer parte do Meet, e não uma janela por cima dele.
 *
 * ── Frágil de propósito, e com rede ────────────────────────────────────────
 *
 * O Meet não oferece lugar para extensões. A barra é achada pelo botão de sair
 * (o mesmo sinal que a detecção da chamada usa): sobe até o primeiro ancestral
 * que agrupa vários botões e entra logo antes dele. Se o Meet mudar a barra, o
 * botão simplesmente não monta — e `montado()` diz isso ao controller, que então
 * mantém a cápsula flutuante como sempre foi. Nada some junto.
 *
 * O Meet redesenha a barra sem avisar e leva embora o que não é dele, então a
 * posição é CONFERIDA a cada passada (`sincronizar`), e o botão volta ao lugar.
 *
 * Marca e estado por escrito: a cor sozinha não distingue pausa de início.
 * Vanilla de propósito: é um botão. Nada de React dentro da barra do Meet.
 */
import { LEAVE_CALL_SELECTORS } from './selectors';
import TOKENS from '@/shared/config/tokens.css?inline';
import { registrarFonteDaCapsula } from '@/content/ui/fonte';

const ID = 'taqciti-botao-na-barra';
const ID_ESTILO = 'taqciti-botao-na-barra-estilo';
const ATRIBUTO = 'data-taqciti-estado';

export type TomDoBotao = 'verde' | 'ambar' | 'vermelho' | 'neutro';

export interface EstadoDoBotao {
  tom: TomDoBotao;
  /** Pulsa: a captura está viva. */
  pulsando: boolean;
  /** O que o leitor de tela e a dica dizem. */
  rotulo: string;
  /** Estado curto, visível sem passar o mouse. */
  texto?: string;
}

const COR: Record<TomDoBotao, string> = {
  verde: 'rgb(var(--c-glow))',
  ambar: 'rgb(var(--c-atencao))',
  vermelho: 'rgb(var(--c-danger))',
  neutro: 'rgb(var(--c-muted))',
};

const ESTILO = `
${TOKENS.replace(/:root|:host/g, `#${ID}`)}
#${ID} {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  width: 176px;
  height: 44px;
  padding: 0 13px 0 10px;
  margin: 0 6px;
  border-radius: 16px;
  border: 1px solid rgb(var(--c-primary) / .28);
  background: rgb(var(--c-surface));
  color: rgb(var(--c-text));
  font: 500 12px/1.3 var(--font-texto);
  cursor: pointer;
  flex: 0 0 auto;
  transition: background-color 0.2s, border-color 0.2s;
}
#${ID}:hover { background: rgb(var(--c-elevated)); border-color: rgb(var(--c-glow) / .6); }
#${ID}:focus-visible { outline: 2px solid rgb(var(--c-glow)); outline-offset: 3px; }
#${ID} svg { width: 26px; height: 26px; display: block; flex-shrink: 0; }
#${ID} .taqciti-textos { display: grid; gap: 1px; text-align: left; white-space: nowrap; }
#${ID} .taqciti-nome { color: rgb(var(--c-text)); font-size: 11px; font-weight: 700; letter-spacing: .03em; }
#${ID} .taqciti-estado { color: var(--taqciti-cor); font-size: 11px; }
#${ID} .taqciti-miolo { transform-origin: center; }
#${ID}[${ATRIBUTO}~="pulsando"] .taqciti-miolo {
  animation: taqciti-pulso 1.6s ease-in-out infinite;
}
@keyframes taqciti-pulso { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (max-width: 900px) {
  #${ID} { width: 152px; padding: 0 8px; gap: 6px; margin: 0 3px; }
  #${ID} .taqciti-nome { display: none; }
}
@media (max-width: 600px) {
  #${ID} { width: 40px; padding: 0; justify-content: center; }
  #${ID} .taqciti-textos { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  #${ID}[${ATRIBUTO}~="pulsando"] .taqciti-miolo { animation: none; }
}
`;

/**
 * O clique veio de uma pessoa? Mesma regra da cápsula (`Capsula.tsx`): a página
 * do Meet alcança este botão e pode disparar `.click()` nele, o que começaria
 * uma captura sem autorização. Evento sintético chega com `isTrusted: false`.
 * Nos testes (jsdom) todo evento é sintético, daí a exceção do modo `test`.
 */
function gestoReal(e: Event): boolean {
  return e.isTrusted || import.meta.env.MODE === 'test';
}

function visivel(el: Element): boolean {
  return typeof el.checkVisibility !== 'function' || el.checkVisibility();
}

/** Onde a barra está: o pai que agrupa os botões, e o filho antes do qual entrar. */
function acharBarra(): { pai: Element; antes: Element } | null {
  for (const seletor of LEAVE_CALL_SELECTORS) {
    for (const sair of document.querySelectorAll(seletor)) {
      if (!visivel(sair)) continue;
      let no: Element = sair;
      for (let nivel = 0; nivel < 5 && no.parentElement; nivel += 1) {
        const pai: Element = no.parentElement;
        if (pai === document.body) break;
        if (pai.querySelectorAll('button').length >= 4) return { pai, antes: no };
        no = pai;
      }
    }
  }
  return null;
}

function icone(): string {
  // O mesmo glifo da escuta: onda à esquerda, escrita à direita.
  return (
    `<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">` +
    `<defs><linearGradient id="taqciti-escuta-tinta" x2="1" y2="1"><stop stop-color="#3ddc2e"/>` +
    `<stop offset=".45" stop-color="#06a48c"/><stop offset=".75" stop-color="#05b2d4"/>` +
    `<stop offset="1" stop-color="#6a3de8"/></linearGradient></defs>` +
    `<g class="taqciti-miolo" fill="none" stroke="url(#taqciti-escuta-tinta)" stroke-width="2.4" stroke-linecap="round">` +
    `<path d="M4 10v8 M8 6v16 M12 9v10 M17 8h7 M17 14h5 M17 20h6"/></g></svg>`
  );
}

export class BotaoNaBarra {
  private el: HTMLButtonElement | null = null;
  private ultimo = '';

  constructor(private readonly aoClicar: () => void) {}

  /** O botão está na barra do Meet agora? */
  montado(): boolean {
    return this.el !== null && this.el.isConnected;
  }

  /** Cria, recoloca e atualiza. Devolve se o botão está na barra depois disto. */
  sincronizar(estado: EstadoDoBotao): boolean {
    const barra = acharBarra();
    if (!barra) {
      this.remover();
      return false;
    }
    this.garantirEstilo();
    if (!this.el) this.el = this.criar();
    // Já no lugar certo? Não mexe: reinserir a cada passada piscaria.
    if (this.el.parentElement !== barra.pai || this.el.nextElementSibling !== barra.antes) {
      barra.pai.insertBefore(this.el, barra.antes);
    }
    const chave = `${estado.tom}|${estado.pulsando}|${estado.rotulo}|${estado.texto}`;
    if (chave !== this.ultimo) {
      this.ultimo = chave;
      this.el.setAttribute(ATRIBUTO, estado.pulsando ? 'pulsando' : 'parado');
      this.el.setAttribute('aria-label', estado.rotulo);
      this.el.title = estado.rotulo;
      this.el.style.setProperty('--taqciti-cor', COR[estado.tom]);
      this.el.querySelector('.taqciti-estado')!.textContent = estado.texto ?? estado.rotulo;
    }
    return true;
  }

  remover(): void {
    this.el?.remove();
    this.el = null;
    this.ultimo = '';
    document.getElementById(ID_ESTILO)?.remove();
  }

  private criar(): HTMLButtonElement {
    const botao = document.createElement('button');
    botao.id = ID;
    botao.type = 'button';
    botao.innerHTML = `${icone()}<span class="taqciti-textos" aria-hidden="true"><span class="taqciti-nome">TaqCiti</span><span class="taqciti-estado"></span></span>`;
    // O clique é tratado aqui, sem `await` antes: é o gesto dele que autoriza o
    // Chrome a abrir a sidebar.
    botao.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!gestoReal(e)) return;
      this.aoClicar();
    });
    return botao;
  }

  private garantirEstilo(): void {
    registrarFonteDaCapsula();
    if (document.getElementById(ID_ESTILO)) return;
    const estilo = document.createElement('style');
    estilo.id = ID_ESTILO;
    estilo.textContent = ESTILO;
    document.head.appendChild(estilo);
  }
}
