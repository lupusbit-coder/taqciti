/**
 * TRANSCRIÇÃO CINÉTICA — a fala ganhando forma palavra a palavra.
 *
 * Cada palavra que o reconhecimento acrescenta entra sozinha: sobe um pouco,
 * acende e se acomoda na linha; as que chegam juntas entram escalonadas. O que
 * já estava escrito não se mexe. O diff que decide o que é novo está em
 * `diffDePalavras.ts` (a legenda do Meet reescreve a fala INTEIRA a cada
 * atualização — não há "pedaço novo" pronto para animar).
 *
 * ── Três decisões que seguram a estabilidade ─────────────────────────────
 *
 *  1. A chave React de cada palavra é o id estável do diff. Palavra que não
 *     mudou é o MESMO elemento: a animação dela não recomeça, nem quando a
 *     grafia é corrigida ("orcamento" → "orçamento.").
 *  2. O trecho recente fica PROVISÓRIO (mais apagado) enquanto o reconhecedor
 *     ainda pode reescrevê-lo, e acende devagar quando assenta. É a única
 *     distinção entre provisório e consolidado: nada de sublinhado ou cor nova.
 *  3. Palavra assentada volta a ser TEXTO CORRIDO: o começo da fala é um nó de
 *     texto só, e os `span` animáveis ficam apenas na ponta ativa. Uma reunião
 *     de uma hora não vira milhares de elementos.
 *
 * O texto renderizado é idêntico ao recebido (mesmos espaços, mesma ordem):
 * `textContent`, seleção e cópia continuam dando a fala exata.
 *
 * Com `prefers-reduced-motion`, o texto aparece de imediato, sem `span` nenhum.
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { proximaVersao, versaoInicial, type Versao } from './diffDePalavras';

/** Enquanto o trecho tem menos que isto, ainda pode ser reescrito. */
export const PROVISORIA_MS = 1100;
/** Depois disto a palavra já acabou de entrar e pode virar texto corrido. */
export const ASSENTADA_MS = 1400;

const relogio = () => Date.now();

function movimentoReduzido(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface Props {
  texto: string;
  /**
   * A fala ainda está sendo reconhecida: o trecho recente aparece provisório.
   * Falso = consolidada (a última palavra acende, nada mais muda).
   */
  vivo?: boolean;
  /** As palavras presentes na montagem também entram animadas (fala nova). */
  animarInicio?: boolean;
  className?: string;
  /** O elemento que embrulha o texto. */
  como?: 'span' | 'p';
}

export function TextoCinetico({
  texto,
  vivo = false,
  animarInicio = false,
  className = '',
  como: Elemento = 'span',
}: Props) {
  const versao = useRef<Versao | null>(null);
  const [, setTique] = useState(0);
  const reduzido = movimentoReduzido();

  // Idempotente para o mesmo texto: a renderização dupla do StrictMode não
  // gera ids novos nem reanima nada.
  const agora = relogio();
  if (!versao.current) versao.current = versaoInicial(texto, agora, animarInicio && !reduzido);
  else versao.current = proximaVersao(versao.current, texto, agora);
  const atual = versao.current;

  /*
   * Um tique depois do texto parar: tira o provisório (a ponta acende) e
   * devolve as palavras assentadas ao texto corrido. Sem ele, uma fala que
   * parou ficaria apagada até a próxima atualização — que pode não vir.
   */
  useEffect(() => {
    if (reduzido) return;
    const t = window.setTimeout(() => setTique((n) => n + 1), ASSENTADA_MS);
    return () => window.clearTimeout(t);
  }, [texto, vivo, reduzido]);

  const classe = `tq-cinetico${className ? ` ${className}` : ''}`;
  if (reduzido) return <Elemento className={classe}>{texto}</Elemento>;

  // O começo assentado vira um nó de texto só.
  let corrido = 0;
  while (corrido < atual.palavras.length && agora - atual.palavras[corrido]!.tocadaEm > ASSENTADA_MS) {
    corrido += 1;
  }
  const inicio = atual.palavras
    .slice(0, corrido)
    .map((p) => p.antes + p.texto)
    .join('');

  return (
    <Elemento className={classe}>
      {inicio}
      {atual.palavras.slice(corrido).map((p) => {
        const provisoria = vivo && agora - p.tocadaEm < PROVISORIA_MS;
        const estilo =
          p.chegada === 'nova' && p.atraso > 0
            ? ({ '--tq-atraso': `${p.atraso}ms` } as CSSProperties)
            : undefined;
        return (
          <Fragment key={p.id}>
            {p.antes}
            <span
              className={`tq-cin-p${p.chegada ? ` ${p.chegada}` : ''}${provisoria ? ' provisoria' : ''}`}
              style={estilo}
            >
              {p.texto}
            </span>
          </Fragment>
        );
      })}
      {atual.final}
    </Elemento>
  );
}
