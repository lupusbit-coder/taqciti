/**
 * Quantas falas da reunião já valem para uma leitura do modelo.
 *
 * No ao vivo, as duas últimas legendas ainda podem ser revistas pelo Meet (a
 * frase cresce, o falante é corrigido), então esperam; com a reunião encerrada,
 * todas valem. Morava no laço do apoio automático (`features/apoio/laco.ts`),
 * que saiu em 23/11/2026; "O que falta fechar" continua precisando dela.
 */

/** As últimas falas do ao vivo ainda podem ser revistas: esperam. */
export const FALAS_INSTAVEIS = 2;

export const falasConsolidadas = (total: number, encerrada: boolean): number =>
  encerrada ? total : Math.max(0, total - FALAS_INSTAVEIS);
