import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleMeetProvider } from './GoogleMeetProvider';

function render(html: string): void {
  document.body.innerHTML = html;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('GoogleMeetProvider — controle de idioma não é botão de legendas', () => {
  it('liga as legendas sem clicar no menu de idioma que aparece antes delas', () => {
    render(`<button aria-label="Idioma das legendas" aria-haspopup="menu">Português</button>
      <button aria-label="Ativar legendas">CC</button>`);
    const idioma = vi.fn();
    const ativar = vi.fn();
    document.querySelectorAll('button')[0]!.addEventListener('click', idioma);
    document.querySelectorAll('button')[1]!.addEventListener('click', ativar);
    expect(new GoogleMeetProvider().requestEnableCaptions()).toBe(true);
    expect(ativar).toHaveBeenCalledTimes(1);
    expect(idioma).not.toHaveBeenCalled();
  });

  it.each(['Desativar legendas', 'Turn off captions'])('não desliga legendas no silêncio: %s', (label) => {
    render(`<button aria-label="${label}">CC</button><div role="region" aria-label="Legendas"></div>`);
    const clique = vi.fn();
    document.querySelector('button')!.addEventListener('click', clique);
    const provider = new GoogleMeetProvider();
    expect(provider.areCaptionsEnabled()).toBe(true);
    provider.requestEnableCaptions();
    provider.requestEnableCaptions();
    expect(clique).not.toHaveBeenCalled();
  });

  it('não usa o nome do idioma como evidência de legendas ligadas', () => {
    render(`<button aria-label="Ativar legendas">CC</button>
      <div role="region" aria-label="Legendas"><button>Português</button></div>`);
    expect(new GoogleMeetProvider().areCaptionsEnabled()).toBe(false);
  });

  it('só o menu de idioma presente não autoriza nenhum clique', () => {
    render('<button aria-label="Caption language" aria-haspopup="menu">English</button>');
    const clique = vi.fn();
    document.querySelector('button')!.addEventListener('click', clique);
    const provider = new GoogleMeetProvider();
    expect(provider.areCaptionsAvailable()).toBe(false);
    expect(provider.requestEnableCaptions()).toBe(false);
    expect(clique).not.toHaveBeenCalled();
  });

  it('ignora o botão escondido do layout anterior', () => {
    render(`<button aria-label="Ativar legendas"></button><button aria-label="Ativar legendas"></button>`);
    const botoes = document.querySelectorAll('button');
    botoes[0]!.checkVisibility = () => false;
    const escondido = vi.fn();
    const visivel = vi.fn();
    botoes[0]!.addEventListener('click', escondido);
    botoes[1]!.addEventListener('click', visivel);
    new GoogleMeetProvider().requestEnableCaptions();
    expect(escondido).not.toHaveBeenCalled();
    expect(visivel).toHaveBeenCalledTimes(1);
  });
});

describe('GoogleMeetProvider — presença confiável e reconciliada', () => {
  it('não promove avatar/falante da legenda a participante', () => {
    render(`
      <div role="region" aria-label="Legendas">
        <div data-participant-id="speaker-only"><span>Ana da legenda</span></div>
      </div>
      <div data-participant-id="self-1">
        <span data-self-name="Bernardo Belfort (Você)">Bernardo Belfort</span>
      </div>
      <div data-participant-id="guest-1">
        <span data-participant-name="Carla Lima">Carla Lima</span>
      </div>
    `);

    const participants = new GoogleMeetProvider().getParticipants();
    expect(participants?.map((entry) => entry.name)).toEqual([
      'Bernardo Belfort',
      'Carla Lima',
    ]);
    expect(participants?.some((entry) => /legenda/i.test(entry.name))).toBe(false);
    expect(participants?.[0]?.isHost).toBe(true);
  });

  it('remove de presentNow quem saiu, preservando firstSeen no retorno', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T10:00:00-03:00'));
    render(`
      <div data-participant-id="self"><span data-self-name="Ana Souza">Ana Souza</span></div>
      <div data-participant-id="guest"><span data-participant-name="Bruno Lima">Bruno Lima</span></div>
    `);
    const provider = new GoogleMeetProvider();
    const first = provider.getParticipants();
    const firstSeen = first?.find((entry) => entry.name === 'Ana Souza')?.firstSeenAt;

    vi.advanceTimersByTime(5_000);
    document.querySelector('[data-participant-id="guest"]')?.remove();
    const current = provider.getParticipants();

    expect(current?.map((entry) => entry.name)).toEqual(['Ana Souza']);
    expect(current?.[0]?.firstSeenAt).toBe(firstSeen);
    expect(current?.[0]?.lastSeenAt).toBe((firstSeen ?? 0) + 5_000);
  });

  it('mantém duas pessoas com o mesmo primeiro nome quando os tiles diferem', () => {
    render(`
      <div data-participant-id="ana-a"><span data-participant-name="Ana Souza">Ana Souza</span></div>
      <div data-participant-id="ana-b"><span data-participant-name="Ana Lima">Ana Lima</span></div>
    `);
    expect(new GoogleMeetProvider().getParticipants()?.map((entry) => entry.name)).toEqual([
      'Ana Souza',
      'Ana Lima',
    ]);
  });

  it('rejeita status/botões e aceita conta pessoal exibida como e-mail', () => {
    render(`
      <div role="listitem" data-user-id="status"><span data-participant-name="Microfone desativado">Microfone desativado</span></div>
      <div role="listitem" data-user-id="personal"><span data-participant-name="conta.pessoal@gmail.com">conta.pessoal@gmail.com</span></div>
    `);
    const participants = new GoogleMeetProvider().getParticipants();
    expect(participants).toHaveLength(1);
    expect(participants?.[0]).toMatchObject({
      providerParticipantId: 'personal',
      source: 'meet_roster',
      confidence: 0.95,
    });
    expect(participants?.[0]?.name.toLowerCase()).toBe('conta.pessoal@gmail.com');
  });
});

describe('GoogleMeetProvider — captura degradada explícita', () => {
  it('preserva a fala com speaker desconhecido e avisa que o parser degradou', () => {
    render(`
      <div role="region" aria-label="Legendas">
        <div>fala preservada sem inventar um participante</div>
      </div>
    `);
    const provider = new GoogleMeetProvider();
    const health: Array<[boolean, string | undefined]> = [];
    const chunks: Array<{ speaker: string | null; text: string }> = [];
    provider.onCaptureHealth((healthy, reason) => health.push([healthy, reason]));
    provider.onCaptionChunk((chunk) => chunks.push(chunk));
    const internals = provider as unknown as {
      captionRegion: Element | null;
      scanCaptions(): void;
    };
    internals.captionRegion = document.querySelector('[role="region"]');
    internals.scanCaptions();

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      speaker: null,
      text: 'fala preservada sem inventar um participante',
    });
    expect(health).toContainEqual([false, 'parser']);
  });
});

/**
 * O vigia da captura (`checkCaptureHealth`). Texto parado na região de legendas
 * depois de 25 s não prova falha: a última legenda pode continuar visível no
 * silêncio. Em 23/11/2026, no verify-ao-vivo, uma pausa assim virou "Erro na
 * captura" com as 14 falas já capturadas. A regra: relê a região; só é falha se a
 * releitura achar fala que o observer perdeu, ou se a região for outra.
 */
describe('GoogleMeetProvider — vigia da captura não confunde silêncio com falha', () => {
  const LEGENDA = `
    <div role="region" aria-label="Legendas">
      <div class="nMcdL"><span class="KcIKyf">Ana Souza</span><div class="bh44bd">Fica combinado o envio na sexta.</div></div>
    </div>`;

  type Internos = {
    captionRegion: Element | null;
    captionsOn: boolean;
    captureExpectedSince: number;
    scanCaptions(): void;
    checkCaptureHealth(): void;
  };

  function comLegendaJaLida() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00-03:00'));
    render(LEGENDA);
    const provider = new GoogleMeetProvider();
    const health: Array<[boolean, string | undefined]> = [];
    const chunks: string[] = [];
    provider.onCaptureHealth((healthy, reason) => health.push([healthy, reason]));
    provider.onCaptionChunk((chunk) => chunks.push(chunk.text));
    const internos = provider as unknown as Internos;
    internos.captionRegion = document.querySelector('[role="region"]');
    internos.captionsOn = true;
    internos.captureExpectedSince = Date.now();
    internos.scanCaptions();
    return { internos, health, chunks };
  }

  it('legenda já capturada parada na tela é silêncio, não falha', () => {
    const { internos, health, chunks } = comLegendaJaLida();
    expect(chunks).toEqual(['Fica combinado o envio na sexta.']);
    vi.advanceTimersByTime(60_000);
    internos.checkCaptureHealth();
    expect(health).not.toContainEqual([false, 'stall']);
    expect(chunks).toHaveLength(1);
  });

  it('fala que o observer perdeu é capturada na releitura e conta como falha', () => {
    const { internos, health, chunks } = comLegendaJaLida();
    vi.advanceTimersByTime(30_000);
    document.querySelector('.bh44bd')!.textContent = 'Fica combinado o envio na sexta. E a revisão na segunda.';
    internos.checkCaptureHealth();
    expect(chunks.at(-1)).toContain('revisão na segunda');
    expect(health).toContainEqual([false, 'stall']);
  });

  it('região trocada pelo Meet continua sendo falha', () => {
    const { internos, health } = comLegendaJaLida();
    internos.captionRegion = document.createElement('div');
    vi.advanceTimersByTime(30_000);
    internos.checkCaptureHealth();
    expect(health).toContainEqual([false, 'stall']);
  });
});

describe('GoogleMeetProvider — o fim da chamada', () => {
  const EM_CHAMADA = '<button aria-label="Sair da chamada">call_end</button>';

  function naSala(): void {
    window.history.replaceState(null, '', '/abc-defg-hij');
  }

  it('reconhece a reunião com o botão de sair na tela', () => {
    naSala();
    render(EM_CHAMADA);
    expect(new GoogleMeetProvider().detectMeeting()?.meetingCode).toBe('abc-defg-hij');
  });

  it('a tela pós-chamada encerra, mesmo com o botão de sair ainda no documento', () => {
    naSala();
    render(`${EM_CHAMADA}<button>Participar novamente</button>`);
    expect(new GoogleMeetProvider().detectMeeting()).toBeNull();
  });

  it('um botão de sair que não é desenhado não conta como reunião', () => {
    naSala();
    render(EM_CHAMADA);
    const botao = document.querySelector('button')!;
    botao.checkVisibility = () => false;
    expect(new GoogleMeetProvider().detectMeeting()).toBeNull();
  });

  it('sair da chamada dispara o fim depois da confirmação dupla', () => {
    vi.useFakeTimers();
    naSala();
    render(EM_CHAMADA);
    const provider = new GoogleMeetProvider();
    const fim = vi.fn();
    provider.onMeetingEnd(fim);
    provider.start();

    render('<button>Voltar à tela inicial</button>');
    vi.advanceTimersByTime(10_000);
    provider.stop();

    expect(fim).toHaveBeenCalledTimes(1);
    expect(fim.mock.calls[0]?.[0]).toMatchObject({ meetingCode: 'abc-defg-hij' });
  });
});

describe('GoogleMeetProvider — outra sala na mesma aba', () => {
  it('encerra a sala antiga e abre a nova, sem recarregar a página', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/abc-defg-hij');
    render('<button aria-label="Sair da chamada">call_end</button>');
    const provider = new GoogleMeetProvider();
    const eventos: string[] = [];
    provider.onMeetingStart((s) => eventos.push(`inicio ${s.meetingCode}`));
    provider.onMeetingEnd((s) => eventos.push(`fim ${s.meetingCode}`));
    provider.start();

    window.history.replaceState(null, '', '/xyz-wxyz-xyz');
    vi.advanceTimersByTime(3_000);
    provider.stop();

    expect(eventos).toEqual(['inicio abc-defg-hij', 'fim abc-defg-hij', 'inicio xyz-wxyz-xyz']);
  });
});
