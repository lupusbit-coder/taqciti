/**
 * A CÁPSULA — e a pergunta que aparece ao lado dela.
 *
 * ── Por que a pergunta mora aqui, e não só na sidebar ────────────────────
 *
 * A sidebar pode estar fechada, e quase sempre está quando se entra numa
 * reunião. Uma pergunta que só existe lá dentro é uma pergunta que ninguém vê —
 * e o resultado prático seria a captura nunca começar, ou começar sozinha.
 *
 * Então a solicitação é desenhada na página, encostada na cápsula: pequena,
 * com a identidade atual, duas ações e nada mais. Não é o painel flutuante
 * antigo de volta: aquele era o produto inteiro numa janela arrastável, com
 * histórico, busca e transcrição. Isto é uma pergunta e dois botões, e some
 * assim que for respondida.
 *
 * A confirmação daqui e a da sidebar são a MESMA decisão: as duas gravam na
 * mesma chave por participação (ver features/meeting/consent.ts). Responder num
 * lugar apaga a pergunta no outro, sem ninguém coordenar nada — e por isso não
 * existe pergunta duplicada.
 *
 * ── O clique abre a sidebar, e isso funciona ─────────────────────────────
 *
 * Por um tempo este botão foi um botão que falhava: `chrome.sidePanel.open()`
 * exige gesto do usuário, e a conclusão foi que o gesto não atravessava a
 * mensageria. Errado. O gesto atravessa; o que ele não sobrevive é a um `await`
 * antes da chamada — e havia um `await ready` no roteador de mensagens do
 * background. Medido no Chrome 144, o caminho abre. Ver
 * `src/background/sidePanel.ts`.
 *
 * É por isso que `abrir()` não é `async` e não espera nada antes de mandar a
 * mensagem. Qualquer `await` acrescentado neste caminho quebra a abertura.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MeetingPhase, PanelPrefs } from '@/shared/types/domain';
import type { DecisaoDeRegistro, GravacaoAnterior } from '@/features/meeting/consent';
import { formatElapsedClock } from '@/shared/ui/format';
import { Icon } from '@/shared/ui/Icon';
import { SinalTaqciti } from '@/shared/ui/SinalTaqciti';
import { derivarEstadoDaCaptura, LEITURA_DO_ESTADO } from '@/shared/ui/estadoDaCaptura';
import { useFloating } from './useFloating';
import { PANEL_OPEN_EVENT } from './mount';

/**
 * O clique veio de uma pessoa?
 *
 * O shadow root da cápsula é `closed` (ver `mount.ts`), então o script da
 * página do Meet não alcança estes botões por `host.shadowRoot`. Esta checagem
 * fica como defesa extra: um `.click()` sintético chegaria com
 * `isTrusted: false`; o clique de verdade, com `true`. Nos testes (jsdom) todo
 * evento é sintético, daí a exceção do modo `test`.
 */
function gestoReal(e: { nativeEvent: Event }): boolean {
  return e.nativeEvent.isTrusted || import.meta.env.MODE === 'test';
}

export interface CapsulaCallbacks {
  /** Pede o painel lateral. Resolve com `false` se o Chrome recusar. */
  onAbrirSidebar(): Promise<boolean>;
  /** Grava posição e presença. Sempre um patch. */
  onPrefsChange(patch: Partial<PanelPrefs>): void;
  /** A resposta à pergunta, dada na página. Mesma decisão da sidebar. */
  onResponder(decisao: DecisaoDeRegistro): void;
  /** "Gravar esta reunião", à mão: o caminho para quando o automático não perguntou. */
  onGravarAgora(): void;
  /** A sala desta página, se houver uma — é o que decide mostrar o botão. */
  salaDisponivel(): { meetingCode: string } | null;
}

interface Props {
  phase: MeetingPhase;
  /** Início da sessão, para o relógio. `null` quando não há captura. */
  startedAt: number | null;
  /** Título da reunião detectada esperando resposta. `null` = não há pergunta. */
  perguntandoSobre: string | null;
  /** A última gravação desta sala, oferecida para continuar. */
  gravacaoAnterior?: GravacaoAnterior | null;
  /** A pessoa disse "agora não" para esta participação. */
  recusado: boolean;
  /** A pergunta "registrar?" falhou de vez: o "Gravar" à mão vira o caminho, e diz por quê. */
  portaoFalhou?: boolean;
  /** `false` = há legenda na tela que a captura não está conseguindo ler. */
  saudavel: boolean;
  /** Instante do último trecho recebido; null = nenhum ainda. */
  ultimoTrechoEm?: number | null;
  /** Quantas falas já foram capturadas. */
  falas?: number;
  prefs: PanelPrefs;
  /**
   * O botão do TaqCiti está na barra de baixo do Meet: é ele que representa a
   * captura, e a cápsula flutuante sai da frente. A pergunta continua aqui.
   */
  barraAtiva?: boolean;
  callbacks: CapsulaCallbacks;
}

/** Quanto tempo a explicação de falha fica na tela. */
const DICA_MS = 6000;

/** Largura do convite; o viewport limita a largura em janelas pequenas. */
const LARGURA_PERGUNTA = 336;
/** Respiro mínimo entre o balão e a borda da tela. */
const MARGEM_DA_PERGUNTA = 12;

export function Capsula({
  phase,
  startedAt,
  perguntandoSobre,
  gravacaoAnterior = null,
  recusado,
  portaoFalhou = false,
  saudavel,
  ultimoTrechoEm = null,
  falas = 0,
  prefs,
  barraAtiva = false,
  callbacks,
}: Props) {
  const [dica, setDica] = useState(false);
  const dicaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const perguntando = perguntandoSobre !== null;

  // Há uma sala nesta página? O Meet é uma SPA: a URL muda sem recarregar, então
  // a resposta é relida de tempos em tempos, e não só quando o estado muda.
  const [temSala, setTemSala] = useState(() => callbacks.salaDisponivel() !== null);
  useEffect(() => {
    const t = setInterval(() => setTemSala(callbacks.salaDisponivel() !== null), 2000);
    return () => clearInterval(t);
  }, [callbacks]);

  // Relógio: só corre enquanto a captura está viva.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      if (dicaTimer.current) clearTimeout(dicaTimer.current);
    },
    [],
  );

  /*
   * NÃO é `async`, e a mensagem é a primeira coisa que acontece: é o gesto do
   * clique que autoriza a abertura do painel, e ele não sobrevive a um `await`.
   */
  const abrir = useCallback(() => {
    void callbacks.onAbrirSidebar().then((ok) => {
      if (ok) return;
      setDica(true);
      if (dicaTimer.current) clearTimeout(dicaTimer.current);
      dicaTimer.current = setTimeout(() => setDica(false), DICA_MS);
    });
  }, [callbacks]);

  /*
   * Dizer que a reunião será registrada abre a sidebar: é o momento em que a
   * pessoa quer ver a transcrição nascer. Abrir vem primeiro — o gesto do clique
   * é o que autoriza, e ele não sobrevive a um `await`.
   */
  const aceitar = useCallback(
    (decisao: DecisaoDeRegistro) => {
      abrir();
      callbacks.onResponder(decisao);
    },
    [abrir, callbacks],
  );

  // O clique no ícone da extensão numa aba que já tem a cápsula montada.
  useEffect(() => {
    const aoPedir = () => abrir();
    document.addEventListener(PANEL_OPEN_EVENT, aoPedir);
    return () => document.removeEventListener(PANEL_OPEN_EVENT, aoPedir);
  }, [abrir]);

  const floating = useFloating({
    x: prefs.x,
    y: prefs.y,
    panel: CAIXA_ZERO,
    onMove: (x, y) => callbacks.onPrefsChange({ x, y }),
  });

  // Fechada: nada na tela. Volta pelo ícone da extensão ou por uma reunião
  // nova — uma pergunta pendente reacende a cápsula, senão ela seria invisível
  // justamente no momento em que tem algo a dizer.
  if (prefs.presence === 'closed' && !perguntando) return null;
  // O botão da barra do Meet já mostra o estado e abre a sidebar: a cápsula
  // flutuante só aparece quando há uma pergunta a fazer.
  if (barraAtiva && !perguntando) return null;

  const estado = derivarEstadoDaCaptura(
    { phase, captureHealthy: saudavel, startedAt, lastChunkAt: ultimoTrechoEm, falas },
    agora,
  );
  const gravando = estado === 'capturando' && !perguntando;

  const rotulo = perguntando
    ? 'Registrar reunião'
    : estado === 'erro'
      ? 'erro na captura'
      : estado === 'interrompida'
        ? 'religando…'
        : estado === 'capturando'
          ? `Transcrevendo ${formatElapsedClock(agora - (startedAt ?? agora))}`
          : estado === 'iniciando'
            ? 'iniciando…'
            : estado === 'aguardando_fonte'
              ? 'aguardando legendas'
              : estado === 'pausada'
                ? 'pausado'
                : estado === 'preparando'
                  ? 'preparando…'
                  : phase === 'ended'
                    ? 'salva'
                    : recusado
                      ? 'sem registro'
                      : 'TaqCiti';
  /** A pergunta abre para cima ou para baixo, conforme onde a cápsula está. */
  const paraBaixo = floating.geometry.capsule.top < window.innerHeight / 2;

  /*
   * Onde a pergunta cabe — e não só onde ela gostaria de ficar.
   *
   * A cápsula nasce encostada à direita (`x: 0.97` em DEFAULT_PANEL_PREFS), e
   * a pergunta era posicionada apenas como "96px à esquerda da cápsula". Numa
   * instalação nova isso punha metade do balão fora da tela: o botão "Agora
   * não" ficava cortado pela borda direita, na primeira reunião de quem acabou
   * de instalar. Medido no Chrome, com a posição padrão.
   *
   * Agora ela é presa dentro do viewport nos dois eixos. `window.innerWidth` é
   * lido no render porque o hook de posicionamento já repinta a cada `resize`.
   */
  const larguraDaPergunta = Math.min(LARGURA_PERGUNTA, window.innerWidth * 0.92);
  const esquerdaDaPergunta = Math.max(
    MARGEM_DA_PERGUNTA,
    Math.min(
      floating.geometry.capsule.left - 96,
      window.innerWidth - larguraDaPergunta - MARGEM_DA_PERGUNTA,
    ),
  );
  const posicaoDaPergunta = barraAtiva
    ? { right: 20, bottom: 88, maxHeight: 'calc(100dvh - 108px)' }
    : {
        left: esquerdaDaPergunta,
        ...(paraBaixo
          ? { top: floating.geometry.capsule.top + 64,
              maxHeight: window.innerHeight - floating.geometry.capsule.top - 76 }
          : { bottom: window.innerHeight - floating.geometry.capsule.top + 12,
              maxHeight: floating.geometry.capsule.top - 24 }),
      };

  return (
    <>
      {!barraAtiva && <button
        ref={floating.capsuleRef as RefObject<HTMLButtonElement>}
        type="button"
        title="TaqCiti — clique para abrir o painel, arraste para mover"
        aria-label={
          perguntando || estado === 'desligada'
            ? 'Abrir a sidebar do TaqCiti'
            : `${LEITURA_DO_ESTADO[estado]}. Abrir a sidebar do TaqCiti`
        }
        {...floating.dragHandlers}
        onPointerMove={(event) => {
          floating.dragHandlers.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          floating.dragHandlers.onPointerUp(event);
          if (gestoReal(event) && floating.wasClick()) abrir();
        }}
        // Enter/Espaço: o clique sintetizado pelo teclado tem `detail === 0` e
        // não passa por pointerup — sem isto, a cápsula focada não abria nada.
        // O clique do mouse (detail ≥ 1) já foi tratado acima.
        onClick={(event) => {
          if (gestoReal(event) && event.detail === 0) abrir();
        }}
        style={{ left: floating.geometry.capsule.left, top: floating.geometry.capsule.top }}
        data-estado={estado}
        className={`tq-meet-capsula ${
          floating.dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <SinalTaqciti altura={23} />
        <span className="tq-meet-capsula-texto">
          <strong>TaqCiti</strong>
          <span>{rotulo}</span>
        </span>
        {gravando && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
        )}
        {perguntando && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#f2c94c] animate-pulse-dot" />
        )}
        {/* Só a MUDANÇA de estado é anunciada: o relógio, que muda a cada segundo, fica de fora. */}
        <span className="sr-only" role="status">{perguntando ? '' : LEITURA_DO_ESTADO[estado]}</span>
      </button>}

      {/* ---------- a solicitação, na própria página ---------- */}
      {perguntando && (
        <div
          role="dialog"
          aria-label="Registrar esta reunião?"
          style={posicaoDaPergunta}
          className="tq-meet-convite"
        >
          <div className="tq-meet-convite-marca">
            <SinalTaqciti altura={28} />
            <span>TaqCiti <span>· seu registro da reunião</span></span>
          </div>
          <h2>Vamos guardar esta conversa?</h2>
          {perguntandoSobre && (
            <p className="tq-meet-sala" title={perguntandoSobre}>{perguntandoSobre}</p>
          )}
          <p className="tq-meet-explicacao">
            Transforme as legendas em uma transcrição para consultar depois.
            O registro fica neste computador, sem gravar áudio ou vídeo.
          </p>

          {gravacaoAnterior && (
            <p className="tq-meet-anterior">
              Último registro nesta sala:{' '}
              <strong className="font-medium">{gravacaoAnterior.title}</strong> ·{' '}
              {new Date(gravacaoAnterior.endedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {gravacaoAnterior.segmentos} {gravacaoAnterior.segmentos === 1 ? 'fala' : 'falas'}.
            </p>
          )}

          {gravacaoAnterior && (
            <button
              type="button"
              onClick={(e) => gestoReal(e) && aceitar(`continuar:${gravacaoAnterior.id}`)}
              className="tq-meet-acao tq-meet-acao-principal tq-meet-continuar"
            >
              Continuar de onde parou
            </button>
          )}
          <div className="tq-meet-acoes">
            <button
              type="button"
              onClick={(e) => gestoReal(e) && aceitar('aceito')}
              className={`tq-meet-acao ${gravacaoAnterior ? '' : 'tq-meet-acao-principal'}`}
            >
              {gravacaoAnterior ? 'Novo registro' : 'Começar registro'}
            </button>
            <button
              type="button"
              onClick={(e) => gestoReal(e) && callbacks.onResponder('recusado')}
              className="tq-meet-acao"
            >
              Agora não
            </button>
          </div>
          <p className="tq-meet-rodape">
            Só começa quando você escolher.
          </p>
        </div>
      )}

      {/* O caminho à mão: numa sala em que NÃO há captura (o automático não
          perguntou, ou foi recusado), a pessoa manda gravar daqui. */}
      {!perguntando && temSala && (estado === 'desligada' || estado === 'salva') && (
        <button
          type="button"
          // Primeiro abre a sidebar (é o gesto do clique que autoriza, e ele não
          // sobrevive a um `await`), depois manda gravar.
          onClick={(event) => {
            if (!gestoReal(event)) return;
            abrir();
            callbacks.onGravarAgora();
          }}
          title="Começar a registrar esta reunião e abrir o painel"
          style={{
            left: Math.max(
              MARGEM_DA_PERGUNTA,
              Math.min(floating.geometry.capsule.left, window.innerWidth - (portaoFalhou ? 360 : 170)),
            ),
            top: floating.geometry.capsule.top + 62,
          }}
          className="tq-meet-manual"
        >
          {portaoFalhou ? 'Não consegui perguntar se devo registrar. Registrar esta reunião?' : 'Registrar esta reunião'}
        </button>
      )}

      {/* A explicação de falha. Só aparece se a abertura for recusada — o que,
          desde a correção do gesto, deixou de ser o caso comum. */}
      {dica && (
        <div
          role="status"
          style={{
            left: floating.geometry.capsule.left,
            top: floating.geometry.capsule.top - 78,
          }}
          className="tq-meet-dica"
        >
          Não consegui abrir o painel daqui.
          <strong className="font-medium text-foreground">
            {' '}
            Clique no ícone do TaqCiti
          </strong>{' '}
          na barra do navegador.
        </div>
      )}

      {/* Esconder: tira a cápsula desta aba. Fora do caminho do arraste, por
          isso um botão próprio e não um gesto na cápsula. */}
      {!perguntando && (
        <button
          type="button"
          title="Esconder a cápsula do TaqCiti"
          aria-label="Esconder a cápsula do TaqCiti"
          onClick={() => callbacks.onPrefsChange({ presence: 'closed' })}
          style={{
            left: floating.geometry.capsule.left - 26,
            top: floating.geometry.capsule.top + 2,
          }}
          className="tq-meet-esconder"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </>
  );
}

/** Estável entre renders: entra nas dependências da geometria do hook. */
const CAIXA_ZERO = { width: 0, height: 0 };
