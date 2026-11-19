import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoNaBarra, type EstadoDoBotao } from './botaoNaBarra';

const ESTADO: EstadoDoBotao = { tom: 'neutro', pulsando: false, rotulo: 'Gravar esta reunião' };

function barraDoMeet(): HTMLElement {
  document.body.innerHTML = `
    <div id="barra">
      <button aria-label="Desativar microfone"></button>
      <button aria-label="Desativar câmera"></button>
      <button aria-label="Ativar legendas"></button>
      <div id="envoltorio"><button aria-label="Sair da chamada"></button></div>
    </div>`;
  return document.getElementById('barra')!;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('BotaoNaBarra', () => {
  it('entra na barra, logo antes do "sair", e se diz montado', () => {
    const barra = barraDoMeet();
    const botao = new BotaoNaBarra(() => undefined);
    expect(botao.sincronizar(ESTADO)).toBe(true);
    expect(botao.montado()).toBe(true);
    const meu = document.getElementById('taqciti-botao-na-barra')!;
    expect(meu.parentElement).toBe(barra);
    expect(meu.nextElementSibling?.id).toBe('envoltorio');
    expect(meu.getAttribute('aria-label')).toBe('Gravar esta reunião');
  });

  it('sem barra (não há botão de sair), não monta e diz que não está lá', () => {
    document.body.innerHTML = '<div><button>x</button></div>';
    const botao = new BotaoNaBarra(() => undefined);
    expect(botao.sincronizar(ESTADO)).toBe(false);
    expect(botao.montado()).toBe(false);
    expect(document.getElementById('taqciti-botao-na-barra')).toBeNull();
  });

  it('o Meet leva o botão embora: a passada seguinte o devolve', () => {
    barraDoMeet();
    const botao = new BotaoNaBarra(() => undefined);
    botao.sincronizar(ESTADO);
    document.getElementById('taqciti-botao-na-barra')!.remove();
    expect(botao.sincronizar(ESTADO)).toBe(true);
    expect(document.querySelectorAll('#taqciti-botao-na-barra')).toHaveLength(1);
  });

  it('o estado muda o rótulo e o clique chama o tratador', () => {
    barraDoMeet();
    const aoClicar = vi.fn();
    const botao = new BotaoNaBarra(aoClicar);
    botao.sincronizar(ESTADO);
    botao.sincronizar({ tom: 'verde', pulsando: true, rotulo: 'Gravando', texto: 'Transcrevendo' });
    const meu = document.getElementById('taqciti-botao-na-barra') as HTMLButtonElement;
    expect(meu.getAttribute('aria-label')).toBe('Gravando');
    expect(meu.getAttribute('data-taqciti-estado')).toBe('pulsando');
    expect(meu.textContent).toContain('Transcrevendo');
    meu.click();
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('atualizar o estado conserva o ícone e o foco, sem reiniciar a animação', () => {
    barraDoMeet();
    const botao = new BotaoNaBarra(() => undefined);
    botao.sincronizar(ESTADO);
    const meu = document.getElementById('taqciti-botao-na-barra')!;
    const svg = meu.querySelector('svg');
    meu.focus();
    botao.sincronizar({ tom: 'ambar', pulsando: false, rotulo: 'Captura pausada', texto: 'Pausado' });
    expect(meu.querySelector('svg')).toBe(svg);
    expect(document.activeElement).toBe(meu);
    expect(meu.textContent).toContain('Pausado');
  });

  it('clique sintético da página (isTrusted: false) não começa a captura', () => {
    // O modo `test` aceita qualquer clique (ver `gestoReal`); aqui simula-se o build
    // de produção para exercitar a recusa de verdade.
    vi.stubEnv('MODE', 'production');
    try {
      barraDoMeet();
      const aoClicar = vi.fn();
      const botao = new BotaoNaBarra(aoClicar);
      botao.sincronizar(ESTADO);
      document.getElementById('taqciti-botao-na-barra')!.dispatchEvent(new MouseEvent('click'));
      expect(aoClicar).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('remover tira o botão e o estilo', () => {
    barraDoMeet();
    const botao = new BotaoNaBarra(() => undefined);
    botao.sincronizar(ESTADO);
    botao.remover();
    expect(document.getElementById('taqciti-botao-na-barra')).toBeNull();
    expect(document.getElementById('taqciti-botao-na-barra-estilo')).toBeNull();
  });
});
