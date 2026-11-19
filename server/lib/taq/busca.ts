import type { GroundingMetadata, Part } from '@google/genai';

/** Só metadados do provedor, nunca URLs extraídas do texto do modelo. */
export function fontesDaBusca(
  texto: string,
  dados?: GroundingMetadata,
  partes: Part[] = [{ text: texto }],
) {
  const fontes = (dados?.groundingChunks ?? []).map((c) => {
    try {
      const url = new URL(c.web?.uri ?? '');
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return { titulo: (c.web?.title || url.hostname).slice(0, 500), url: url.href };
    } catch {
      return null;
    }
  });
  // O SDK define os índices em bytes UTF-8. Conferir o trecho evita colocar
  // uma citação no lugar errado em respostas com acentos ou várias partes.
  const offsets: number[] = [];
  let acumulado = 0;
  for (const parte of partes) {
    offsets.push(acumulado);
    if (!parte.thought) acumulado += (parte.text ?? '').length;
  }
  const insercoes = new Map<number, Set<string>>();
  for (const apoio of dados?.groundingSupports ?? []) {
    const s = apoio.segment;
    if (!s?.text || s.endIndex === undefined) continue;
    const indiceDaParte = s.partIndex ?? 0;
    const parte = partes[indiceDaParte];
    if (!parte?.text || parte.thought) continue;
    const bytes = Buffer.from(parte.text, 'utf8');
    const inicio = s.startIndex ?? 0;
    if (
      !Number.isInteger(inicio) ||
      !Number.isInteger(s.endIndex) ||
      inicio < 0 ||
      s.endIndex > bytes.length ||
      s.endIndex < inicio
    )
      continue;
    if (bytes.subarray(inicio, s.endIndex).toString('utf8') !== s.text) continue;
    const posicao =
      offsets[indiceDaParte]! + bytes.subarray(0, s.endIndex).toString('utf8').length;
    const links = insercoes.get(posicao) ?? new Set<string>();
    for (const i of apoio.groundingChunkIndices ?? []) {
      const fonte = fontes[i];
      if (fonte)
        links.add(
          `[web ${i + 1}](${fonte.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`,
        );
    }
    insercoes.set(posicao, links);
  }
  for (const [posicao, links] of [...insercoes].sort(([a], [b]) => b - a)) {
    if (links.size)
      texto = texto.slice(0, posicao) + ' ' + [...links].join(' ') + texto.slice(posicao);
  }
  const sugestoesHtml = dados?.searchEntryPoint?.renderedContent;
  const validas = fontes.filter((f) => f !== null);
  return {
    texto,
    ...(validas.length || sugestoesHtml
      ? {
          pesquisaWeb: {
            fontes: validas,
            ...(sugestoesHtml ? { sugestoesHtml } : {}),
          },
        }
      : {}),
  };
}
