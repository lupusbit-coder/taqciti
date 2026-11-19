/**
 * O DIFF por palavra da transcrição cinética — função pura, sem DOM.
 *
 * ── Por que não basta animar o parágrafo ─────────────────────────────────
 *
 * A legenda do Meet não chega em pedaços novos: cada atualização traz a FALA
 * INTEIRA de novo (ver `features/transcription/mergeCaption.ts`). "bom dia" vira
 * "bom dia pessoal", e depois "bom dia, pessoal." — o mesmo texto reescrito com
 * uma palavra a mais e pontuação corrigida. Animar o bloco a cada mudança
 * reanimava a frase inteira cinco vezes por segundo; não animar deixava o texto
 * aparecendo como bloco estático.
 *
 * Aqui cada versão é comparada com a anterior, palavra a palavra, e cada palavra
 * ganha um id que SOBREVIVE às versões. O componente usa esse id como chave
 * React: palavra que não mudou é o mesmo elemento, e a animação dela não
 * recomeça. Só o que de fato entrou (ou foi trocado) nasce com animação.
 *
 * ── A comparação ────────────────────────────────────────────────────────
 *
 * Em palavras NORMALIZADAS (sem acento, sem pontuação, minúsculas), a mesma
 * regra do `mergeCaption`: o reconhecedor reescreve acento e vírgula no meio da
 * frase o tempo todo, e "orcamento" → "orçamento." não é palavra nova — é a mesma,
 * com a grafia corrigida. Ela fica no lugar, sem piscar.
 *
 * Prefixo comum + sufixo comum; o miolo é o que mudou. Miolo novo onde antes
 * havia palavras é CORREÇÃO (transição localizada, sem deslocamento); miolo
 * novo além do que havia é ENTRADA (a animação de chegada, escalonada).
 * A ordem e o texto das palavras são sempre os da versão nova: a animação nunca
 * altera o que foi dito.
 */

export type Chegada = 'nova' | 'troca';

export interface Palavra {
  /** Estável entre versões enquanto a palavra (normalizada) for a mesma. */
  id: number;
  /** O texto exato desta versão, com acento e pontuação. */
  texto: string;
  /** O espaço que vem ANTES desta palavra, exatamente como no original. */
  antes: string;
  /** Como esta palavra entrou na versão em que nasceu; `null` = já estava. */
  chegada: Chegada | null;
  /** Atraso da entrada, em ms, dentro do lote em que chegou. */
  atraso: number;
  /** Quando a palavra nasceu ou mudou (relógio de quem chama). */
  tocadaEm: number;
}

export interface Versao {
  texto: string;
  palavras: Palavra[];
  /** Espaço depois da última palavra. */
  final: string;
  proximoId: number;
}

const DIACRITICOS = /[̀-ͯ]/g;
const NAO_PALAVRA = /[^\p{L}\p{N}]/gu;

/** A mesma normalização de `mergeCaption.keyOf`. */
export function chaveDaPalavra(palavra: string): string {
  return palavra.normalize('NFD').replace(DIACRITICOS, '').replace(NAO_PALAVRA, '').toLowerCase();
}

/** Palavras e o espaço antes de cada uma, preservando o texto byte a byte. */
function separar(texto: string): { pedacos: Array<{ texto: string; antes: string }>; final: string } {
  const pedacos: Array<{ texto: string; antes: string }> = [];
  let antes = '';
  for (const m of texto.matchAll(/\s+|\S+/g)) {
    const t = m[0];
    if (/^\s/.test(t)) antes += t;
    else {
      pedacos.push({ texto: t, antes });
      antes = '';
    }
  }
  return { pedacos, final: antes };
}

/**
 * O intervalo entre palavras que chegam juntas.
 *
 * Até seis palavras, 36ms entre elas — o escalonamento se lê como fala. Uma
 * frase inteira de uma vez divide um teto de ~220ms: a última palavra nunca
 * espera mais que isso, e a transcrição não fica atrás do reconhecimento.
 */
export function intervaloDoLote(quantas: number): number {
  if (quantas <= 1) return 0;
  if (quantas <= 6) return 36;
  return Math.max(8, Math.round(220 / (quantas - 1)));
}

/** A primeira versão. `animar` = as palavras já presentes entram com animação. */
export function versaoInicial(texto: string, agora: number, animar: boolean): Versao {
  const { pedacos, final } = separar(texto);
  const passo = intervaloDoLote(pedacos.length);
  return {
    texto,
    final,
    proximoId: pedacos.length,
    palavras: pedacos.map((p, i) => ({
      id: i,
      texto: p.texto,
      antes: p.antes,
      chegada: animar ? 'nova' : null,
      atraso: animar ? i * passo : 0,
      tocadaEm: animar ? agora : -Infinity,
    })),
  };
}

/** A versão seguinte, reaproveitando os ids do que não mudou. */
export function proximaVersao(anterior: Versao, texto: string, agora: number): Versao {
  if (texto === anterior.texto) return anterior;
  const { pedacos, final } = separar(texto);
  const velhas = anterior.palavras;
  const chavesVelhas = velhas.map((p) => chaveDaPalavra(p.texto));
  const chavesNovas = pedacos.map((p) => chaveDaPalavra(p.texto));

  let prefixo = 0;
  const limite = Math.min(velhas.length, pedacos.length);
  while (prefixo < limite && chavesVelhas[prefixo] === chavesNovas[prefixo]) prefixo += 1;
  let sufixo = 0;
  while (
    sufixo < limite - prefixo &&
    chavesVelhas[velhas.length - 1 - sufixo] === chavesNovas[pedacos.length - 1 - sufixo]
  ) {
    sufixo += 1;
  }

  let proximoId = anterior.proximoId;
  const trocadasNoMiolo = velhas.length - prefixo - sufixo;
  const novasNoMiolo = pedacos.length - prefixo - sufixo;
  const passo = intervaloDoLote(Math.max(0, novasNoMiolo - trocadasNoMiolo));

  const palavras: Palavra[] = pedacos.map((p, i) => {
    const doSufixo = i >= pedacos.length - sufixo;
    if (i < prefixo || doSufixo) {
      const velha = velhas[i < prefixo ? i : velhas.length - (pedacos.length - i)]!;
      // A mesma palavra; só a grafia pode ter mudado (acento, vírgula). Fica
      // no lugar, com o mesmo id, sem animação nova.
      return velha.texto === p.texto && velha.antes === p.antes
        ? velha
        : { ...velha, texto: p.texto, antes: p.antes };
    }
    const noMiolo = i - prefixo;
    const ehTroca = noMiolo < trocadasNoMiolo;
    return {
      id: proximoId++,
      texto: p.texto,
      antes: p.antes,
      chegada: ehTroca ? 'troca' : 'nova',
      atraso: ehTroca ? 0 : (noMiolo - trocadasNoMiolo) * passo,
      tocadaEm: agora,
    };
  });

  return { texto, palavras, final, proximoId };
}
