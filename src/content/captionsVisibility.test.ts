/** O Meet reutiliza regiões de legenda para controles. A ocultação precisa
 * retirar suas marcas antigas, sem colapsar idioma, vídeo ou o documento. */
import { afterEach, describe, expect, it } from 'vitest';
import { setNativeCaptionsHidden } from './captionsVisibility';

const WRAPPER = 'data-taqciti-caption-wrapper';
const OCULTO = 'data-taqciti-caption-hidden';
const quadro = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

afterEach(() => {
  setNativeCaptionsHidden(false);
  document.body.replaceChildren();
});

describe('ocultar legendas preserva os controles do Meet', () => {
  it('oculta falas dentro da região, mas preserva o seletor de idioma', () => {
    document.body.innerHTML = `<div id="pai"><div role="region" aria-label="Legendas">
      <button aria-label="Idioma das legendas">Português</button>
      <div class="nMcdL"><span class="bh44bd">Fala de teste</span></div>
    </div></div>`;
    setNativeCaptionsHidden(true);
    expect(document.querySelector('.nMcdL')!.hasAttribute(OCULTO)).toBe(true);
    expect(document.querySelector('[role="region"]')!.hasAttribute(OCULTO)).toBe(false);
    expect(document.getElementById('pai')!.hasAttribute(WRAPPER)).toBe(false);
  });

  it('devolve a altura quando o Meet adiciona controles a um invólucro antes vazio', async () => {
    document.body.innerHTML = '<div id="pai"><div role="region" aria-label="Legendas"></div></div>';
    setNativeCaptionsHidden(true);
    const pai = document.getElementById('pai')!;
    expect(pai.hasAttribute(WRAPPER)).toBe(true);
    pai.appendChild(document.createElement('button'));
    await quadro();
    expect(pai.hasAttribute(WRAPPER)).toBe(false);
  });

  it('retira a ocultação da região que passa a hospedar o idioma', async () => {
    document.body.innerHTML = '<div><div role="region" aria-label="Legendas"></div></div>';
    setNativeCaptionsHidden(true);
    const region = document.querySelector('[role="region"]')!;
    expect(region.hasAttribute(OCULTO)).toBe(true);
    region.appendChild(document.createElement('button'));
    await quadro();
    expect(region.hasAttribute(OCULTO)).toBe(false);
    expect(region.parentElement!.hasAttribute(WRAPPER)).toBe(false);
  });

  it('não colapsa body mesmo quando a região é seu único filho', () => {
    document.body.innerHTML = '<div role="region" aria-label="Legendas"></div>';
    setNativeCaptionsHidden(true);
    expect(document.body.hasAttribute(WRAPPER)).toBe(false);
  });

  it('desligar cancela a marcação pendente e restaura todos os elementos', async () => {
    document.body.innerHTML = '<div><div role="region" aria-label="Legendas"></div></div>';
    setNativeCaptionsHidden(true);
    document.querySelector('[role="region"]')!.appendChild(document.createElement('span'));
    await Promise.resolve();
    setNativeCaptionsHidden(false);
    await quadro();
    expect(document.querySelector(`[${WRAPPER}], [${OCULTO}]`)).toBeNull();
    expect(document.getElementById('taqciti-captions-visibility')).toBeNull();
  });
});
