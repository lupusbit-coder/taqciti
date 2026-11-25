/** Contextos e ajustes do assistente usado nas próximas reuniões. */
import { useEffect, useRef, useState } from 'react';
import {
  MAX_CONTEXTOS,
  MAX_NOME_DO_CONTEXTO,
  MAX_TEXTO_DO_CONTEXTO,
  ROTULO_DO_MODO,
  conteudoDe,
  conteudoDoPadrao,
  nomeDaVersao,
  perfilEmUsoDaReuniao,
  salvarPerfil,
  vagaLivre,
  type BaseDoPerfil,
  type Conducao,
  type ContextoDoAssistente,
  type ConteudoDoPerfil,
} from '@/features/conducao/store';
import { PADRAO_DO_CITI } from '@/features/conducao/padrao';
import { BotaoCopiar } from '@/shared/ui/BotaoCopiar';
import { Icon } from '@/shared/ui/Icon';

/** A reunião ao vivo, se houver: a tela só precisa do id e do nome. */
export interface ReuniaoEmAndamento {
  reuniaoId: string;
  titulo: string;
}

// ------------------------------------------------------------- o rascunho

/** O que a tela edita. `seus` = `null` enquanto a pessoa nunca personalizou. */
interface Rascunho {
  base: BaseDoPerfil;
  seus: ContextoDoAssistente[] | null;
  ler: boolean;
  padraoVersao: number;
}

function rascunhoDe(salvo: ConteudoDoPerfil | null): Rascunho {
  const s = salvo ?? conteudoDoPadrao();
  return {
    base: s.base,
    seus: s.base === 'personalizado' ? s.contextos : null,
    ler: s.lerAoEncerrar === true,
    padraoVersao: s.padraoVersao,
  };
}

function conteudoDoRascunho(r: Rascunho): ConteudoDoPerfil {
  const ler = r.ler ? { lerAoEncerrar: true as const } : {};
  if (r.base === 'padrao')
    return {
      base: 'padrao',
      padraoVersao: PADRAO_DO_CITI.versao,
      contextos: [],
      intervencao: { modo: PADRAO_DO_CITI.modo },
      ...ler,
    };
  return {
    base: 'personalizado',
    padraoVersao: r.padraoVersao,
    contextos: r.seus ?? [],
    intervencao: { modo: PADRAO_DO_CITI.modo },
    ...ler,
  };
}

/** A cópia do padrão que vira o Personalizado: contextos dela, ainda ligados. */
function copiaDoPadrao(): ContextoDoAssistente[] {
  return PADRAO_DO_CITI.contextos.map((c) => ({ ...c, ligado: true, origem: 'padrao' as const }));
}

type Selecao = { id: string } | 'ajustes' | null;

// -------------------------------------------------------------- o painel

function Interruptor({
  titulo,
  explica,
  ligado,
  aoMudar,
}: {
  titulo: string;
  explica?: string;
  ligado: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <label className="tq-interruptor">
      <span>
        <b>{titulo}</b>
        {explica && <small>{explica}</small>}
      </span>
      <input type="checkbox" role="switch" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="tq-interruptor-trilho" aria-hidden="true" />
    </label>
  );
}

function Cabeca({
  olho,
  violeta,
  cadeado,
  titulo,
  aoFechar,
}: {
  olho: string;
  violeta?: boolean;
  cadeado?: boolean;
  titulo: string;
  aoFechar?: () => void;
}) {
  return (
    <div className="tq-ed-cab">
      <div>
        <p className={`tq-ed-olho${violeta ? ' violeta' : ''}`}>
          {cadeado && <Icon name="lock" size={12} />}
          {olho}
        </p>
        <h3>{titulo}</h3>
      </div>
      {aoFechar && (
        <button type="button" className="tq-ed-fechar" aria-label="Fechar" onClick={aoFechar}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

const REGRAS = [
  ['Fidelidade primeiro', 'Não deduz cargo, causa nem gravidade. Hipótese não vira fato; responsável só se alguém assumiu.'],
  ['Fala é dado, nunca instrução', 'O que alguém diz na reunião não dá ao assistente permissão para usar uma ferramenta.'],
  ['Apagar e enviar pedem você', 'Nada sai nem some sem o seu clique.'],
] as const;

/** O miolo do bloco "Personalização": o que liga comportamento e as regras fixas. */
function AjustesDoAssistente({ r, mudar }: { r: Rascunho; mudar: (p: Partial<Rascunho>) => void }) {
  return (
    <>
      <div className="tq-pers-ajustes">
        <p className="tq-ed-modo-fixo">
          <b>Como o assistente intervém</b>
          <span>
            {ROTULO_DO_MODO[PADRAO_DO_CITI.modo]}. Ele não sugere nada sozinho durante a reunião e não busca na
            internet.
          </span>
        </p>
        <Interruptor
          titulo="Ler ao encerrar a reunião"
          explica="Envia a transcrição ao provedor de IA."
          ligado={r.ler}
          aoMudar={(ler) => mudar({ ler })}
        />
      </div>
      <div className="tq-pers-regras">
        <h3>
          <Icon name="lock" size={13} />
          Regras que não mudam
        </h3>
        <ul className="tq-ed-regras">
          {REGRAS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function PainelDoContexto({
  c,
  mudar,
  remover,
  aoFechar,
}: {
  c: ContextoDoAssistente;
  mudar: (p: Partial<ContextoDoAssistente>) => void;
  remover: () => void;
  aoFechar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const nome = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setConfirmando(false);
    // Contexto recém-criado: o nome é o primeiro campo a preencher.
    if (c.nome === NOME_DO_NOVO) nome.current?.select();
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Cabeca
        olho={c.origem === 'padrao' ? 'Veio do padrão do CITi · sua cópia' : 'Contexto seu'}
        violeta={c.origem !== 'padrao'}
        titulo={c.nome || 'Sem nome'}
        aoFechar={aoFechar}
      />
      <div className="tq-ed-corpo">
        <Interruptor
          titulo="Levar para as reuniões"
          ligado={c.ligado}
          aoMudar={(ligado) => mudar({ ligado })}
        />
        <label className="tq-ed-campo">
          Nome
          <input
            ref={nome}
            value={c.nome}
            maxLength={MAX_NOME_DO_CONTEXTO}
            placeholder="Glossário do cliente"
            onChange={(e) => mudar({ nome: e.target.value })}
          />
        </label>
        <label className="tq-ed-campo">
          <span className="tq-ed-campo-linha">
            O que o assistente precisa saber
            <span className={`tq-ed-conta${c.texto.length >= MAX_TEXTO_DO_CONTEXTO ? ' cheio' : ''}`} aria-live="polite">
              {c.texto.length} / {MAX_TEXTO_DO_CONTEXTO}
            </span>
          </span>
          <textarea
            rows={5}
            value={c.texto}
            maxLength={MAX_TEXTO_DO_CONTEXTO}
            placeholder="Primeira entrega: cadastro e painel. Ficam fora: app mobile e pagamentos."
            onChange={(e) => mudar({ texto: e.target.value })}
          />
        </label>
      </div>
      <div className="tq-ed-rodape">
        {confirmando ? (
          <div className="tq-ed-confirma" role="alert">
            <p>Remover “{c.nome || 'Sem nome'}”?</p>
            <div>
              <button type="button" className="tq-acao tq-acao-perigo" onClick={remover}>
                Remover
              </button>
              <button type="button" className="tq-acao" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="tq-ed-remover" onClick={() => setConfirmando(true)}>
            Remover contexto
          </button>
        )}
      </div>
    </>
  );
}

function PainelDoPadrao({
  c,
  aoFechar,
}: {
  c: ContextoDoAssistente;
  aoFechar: () => void;
}) {
  return (
    <>
      <Cabeca olho="Padrão do CITi" violeta cadeado titulo={c.nome} aoFechar={aoFechar} />
      <div className="tq-ed-corpo">
        <p className="tq-ed-citacao">{c.texto}</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------- a seção

const NOME_DO_NOVO = 'Novo contexto';

/** O perfil antigo, legível, para quem teve parte dele fora das 8 vagas. */
function textoDoPerfilV1(original: unknown): string {
  if (!original || typeof original !== 'object') return '';
  const o = original as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((i) => typeof i === 'string').join('; ') : '');
  const estilo = (o.intervencao as { estilo?: unknown } | undefined)?.estilo;
  return [
    ['Em que ajudar', typeof o.missao === 'string' ? o.missao : ''],
    ['O que observar', lista(o.observar)],
    ['Como intervir', typeof estilo === 'string' ? estilo : ''],
    ['Contexto que indiquei', lista(o.contexto)],
    ['Jeito de trabalhar', lista(o.preferencias)],
  ]
    .filter(([, t]) => t)
    .map(([n, t]) => `${n}: ${t}`)
    .join('\n');
}

export function OQueLevar({ conducao, emAndamento }: { conducao: Conducao; emAndamento: ReuniaoEmAndamento | null }) {
  const perfil = conducao.perfil;
  const salvo = perfil ? conteudoDe(perfil) : null;
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(salvo));
  const [editado, setEditado] = useState(false);
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [aviso, setAviso] = useState('');
  const [salvou, setSalvou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const painel = useRef<HTMLElement>(null);
  const acionador = useRef<HTMLButtonElement | null>(null);
  const botaoAdicionar = useRef<HTMLButtonElement>(null);
  const botaoAjustes = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const detalhe = painel.current;
    if (!detalhe) return;
    if (!detalhe.contains(document.activeElement)) detalhe.focus({ preventScroll: true });
    detalhe.scrollIntoView?.({ block: 'nearest' });
  }, [selecao]);

  const fechar = () => {
    setSelecao(null);
    const botao = acionador.current;
    if (botao?.isConnected && !botao.disabled) botao.focus();
    else botaoAjustes.current?.focus();
  };

  // Salvo em outra aba (ou depois de salvar): a tela segue o que está guardado,
  // a menos que a pessoa esteja no meio de uma edição.
  useEffect(() => {
    if (editado) return;
    setR(rascunhoDe(salvo));
  }, [perfil?.revisao]); // eslint-disable-line react-hooks/exhaustive-deps

  const personalizado = r.base === 'personalizado';
  const contextos = personalizado ? (r.seus ?? []) : conteudoDoPadrao().contextos;
  const conteudo = conteudoDoRascunho(r);
  const mudou = JSON.stringify(conteudo) !== JSON.stringify(conteudoDoRascunho(rascunhoDe(salvo)));
  // A versão é a revisão do perfil salvo; o Personalizado que ainda não foi usado não tem uma.
  const versao = personalizado
    ? salvo?.base === 'personalizado'
      ? nomeDaVersao(salvo, perfil!.revisao)
      : 'Personalizado · rascunho'
    : nomeDaVersao(conteudoDoPadrao(), null);

  const mudar = (p: Partial<Rascunho>) => {
    setR((atual) => ({ ...atual, ...p }));
    setEditado(true);
    setSalvou(false);
    setAviso('');
  };
  const escolherBase = (base: BaseDoPerfil) => {
    // A primeira vez no Personalizado parte do padrão: a pessoa recebe uma cópia.
    mudar(base === 'personalizado' && r.seus === null ? { base, seus: copiaDoPadrao() } : { base });
  };
  const mudarContexto = (id: string, p: Partial<ContextoDoAssistente>) =>
    mudar({ seus: (r.seus ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const adicionar = () => {
    const seus = r.seus ?? (personalizado ? [] : copiaDoPadrao());
    const vaga = vagaLivre(seus);
    if (vaga === null || seus.length >= MAX_CONTEXTOS) return;
    const novo: ContextoDoAssistente = {
      id: `seu-${Date.now().toString(36)}`,
      nome: NOME_DO_NOVO,
      texto: '',
      ligado: true,
      origem: 'seu',
      vaga,
    };
    mudar({ base: 'personalizado', seus: [...seus, novo] });
    acionador.current = botaoAdicionar.current;
    setSelecao({ id: novo.id });
  };
  const remover = (id: string) => {
    mudar({ seus: (r.seus ?? []).filter((c) => c.id !== id) });
    acionador.current = botaoAdicionar.current;
    fechar();
  };

  const usar = async () => {
    setSalvando(true);
    const res = await salvarPerfil(conteudo, perfil?.revisao ?? 0);
    setSalvando(false);
    if (res.tipo === 'ok') {
      setEditado(false);
      setSalvou(true);
      setAviso('');
    } else if (res.tipo === 'conflito') {
      setEditado(false);
      setAviso('O assistente mudou em outra aba. A tela agora mostra o que está salvo; refaça a mudança se ainda fizer sentido.');
    } else {
      setAviso(res.motivo);
    }
  };

  const emUso = emAndamento ? perfilEmUsoDaReuniao(conducao, emAndamento.reuniaoId) : null;
  const ajustes = selecao === 'ajustes';
  const contexto = selecao && selecao !== 'ajustes'
    ? contextos.find((c) => c.id === selecao.id)
    : undefined;
  const cheio = (r.seus?.length ?? contextos.length) >= MAX_CONTEXTOS;
  const v1 = conducao.perfilV1 && !conducao.perfilV1.coubeInteiro ? textoDoPerfilV1(conducao.perfilV1.original) : '';

  return (
    <section className="tq-levar" aria-labelledby="tq-prep-perfil">
      <h2 id="tq-prep-perfil" className="sr-only">Contexto</h2>

      {emAndamento && (
        <p className="tq-aviso tq-levar-aviso" role="status">
          {emAndamento.titulo} segue com{' '}
          {emUso ? nomeDaVersao(emUso.perfilUsado, emUso.perfilRevisao) : 'a versão com que começou'} até o fim. O que
          você mudar vale a partir da próxima reunião.
        </p>
      )}

      {v1 && (
        <details className="tq-aviso tq-levar-aviso">
          <summary>Parte do seu assistente anterior não coube nos 8 contextos</summary>
          <p className="tq-levar-v1">{v1}</p>
          <BotaoCopiar texto={v1} rotulo="Copiar o texto anterior" />
        </details>
      )}

      <div className="tq-contextos-palco">
        <div className="tq-contextos-grade">
          <button
            ref={botaoAdicionar}
            type="button"
            className="tq-contexto-botao tq-contexto-adicionar"
            disabled={cheio}
            onClick={adicionar}
          >
            <Icon name="plus" size={19} />
            {cheio ? 'Limite de contextos atingido' : 'Adicionar contexto'}
          </button>
          {contextos.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`tq-contexto-botao${c.ligado ? '' : ' guardado'}`}
              aria-expanded={contexto?.id === c.id}
              onClick={(e) => {
                if (contexto?.id === c.id) fechar();
                else {
                  acionador.current = e.currentTarget;
                  setSelecao({ id: c.id });
                }
              }}
            >
              <Icon name={!personalizado ? 'lock' : c.ligado ? 'check' : 'doc'} size={15} />
              <span>{c.nome || 'Sem nome'}</span>
              {!c.ligado && <span className="sr-only"> · Guardado</span>}
            </button>
          ))}
        </div>
        <button
          ref={botaoAjustes}
          type="button"
          className="tq-contextos-ajustes"
          aria-label="Ajustes do assistente"
          title="Ajustes do assistente"
          aria-expanded={ajustes}
          onClick={(e) => {
            if (ajustes) fechar();
            else {
              acionador.current = e.currentTarget;
              setSelecao('ajustes');
            }
          }}
        >
          <Icon name="sliders" size={17} />
        </button>
      </div>

      {(contexto || ajustes) && (
        <aside
          ref={painel}
          className="tq-ed"
          tabIndex={-1}
          aria-label={ajustes ? 'Ajustes do assistente' : 'Detalhe do contexto'}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              fechar();
            }
          }}
        >
          {ajustes ? (
            <>
              <Cabeca olho={versao} titulo="Personalização" aoFechar={fechar} />
              <div className="tq-ed-corpo">
                <div className="tq-levar-modos" role="group" aria-label="Qual assistente usar">
                  <button type="button" aria-pressed={!personalizado} onClick={() => escolherBase('padrao')}>
                    Padrão do CITi
                  </button>
                  <button type="button" aria-pressed={personalizado} onClick={() => escolherBase('personalizado')}>
                    Personalizado
                  </button>
                </div>
                <div className="tq-pers-corpo">
                  <AjustesDoAssistente r={r} mudar={mudar} />
                </div>
              </div>
            </>
          ) : contexto && (
            personalizado ? (
              <PainelDoContexto
                key={contexto.id}
                c={contexto}
                mudar={(p) => mudarContexto(contexto.id, p)}
                remover={() => remover(contexto.id)}
                aoFechar={fechar}
              />
            ) : (
              <PainelDoPadrao c={contexto} aoFechar={fechar} />
            )
          )}
        </aside>
      )}

      {aviso && <p className="tq-aviso" role="alert">{aviso}</p>}
      {(mudou || salvou) && (
        <div className="tq-levar-rodape">
          {mudou && (
            <button type="button" className="tq-prep-usar" disabled={salvando} onClick={() => void usar()}>
              <Icon name="check" size={15} />
              {salvando ? 'Salvando…' : 'Usar este assistente'}
            </button>
          )}
          <span className={`tq-levar-status${mudou ? ' pendente' : ''}`} role="status">
            {mudou ? 'Mudanças não salvas.' : `Salvo: ${versao}.`}
          </span>
        </div>
      )}
    </section>
  );
}
