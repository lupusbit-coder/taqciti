/**
 * Ata de um Review técnico contra o modelo de VERDADE — só roda com `ATA_LIVE=1`.
 *
 * Variante de `ataResumo.live.test.ts`: a reunião é a sintética
 * `docs/fixtures/review-cadastro-fornecedores.txt`, com gabarito em
 * `docs/fixtures/review-cadastro-fornecedores.gabarito.md`. O que se confere é o
 * contrato do gabarito: decisão revertida só vale a última, hipótese não vira
 * causa, gravidade não dita não se deduz, número de passagem não vira meta, quem
 * não participou não entra e cargo só aparece quando foi dito.
 *
 *   ATA_LIVE=1 DOCUMENTOS_AMOSTRAS=<pasta> npx vitest run lib/documentos/ataReview.live.test.ts
 *
 * Com chave de free tier o conteúdo vai para treinamento do provedor: só a
 * fixture sintética passa por aqui (regra da suíte ao vivo).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocumentData } from '../documentData';

const AO_VIVO = process.env.ATA_LIVE === '1';

// Mesma exceção declarada de `ataResumo.live.test.ts`: com `ATA_LIVE=1` a tranca
// do `vitest.setup.ts` é suspensa antes de qualquer import de `../ai`.
if (AO_VIVO) delete process.env.MOCK_LLM;

if (AO_VIVO && existsSync('.env.local')) {
  for (const linha of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^['"]|['"]$/g, '');
  }
}

const REUNIAO = AO_VIVO ? readFileSync('docs/fixtures/review-cadastro-fornecedores.txt', 'utf8') : '';

async function gerarAta() {
  const { generateStep } = await import('../generateStep');
  const { renderPdfDoCatalogo } = await import('./doCatalogo');
  const t0 = Date.now();
  const passo = await generateStep({
    transcript: REUNIAO,
    documentType: 'ata',
    completed: [],
    answers: [],
    documentData: { metadata: { date: '14/11/2026' } },
  });
  const data = passo.documentData;
  const pdf = await renderPdfDoCatalogo({
    documentType: 'ata',
    data,
    tituloDaReuniao: 'Review — Cadastro de fornecedores (sintética)',
  });

  const pasta = process.env.DOCUMENTOS_AMOSTRAS;
  if (pasta) {
    mkdirSync(pasta, { recursive: true });
    writeFileSync(join(pasta, 'ao-vivo-review-ata.pdf'), pdf);
    writeFileSync(join(pasta, 'ao-vivo-review-ata.documentData.json'), JSON.stringify(data, null, 2));
    writeFileSync(join(pasta, 'ao-vivo-review-ata.descartes.json'), JSON.stringify(passo.report?.discarded ?? [], null, 2));
  }
  console.log(
    `\n[ata/review] ${Date.now() - t0} ms; chamadas: ${passo.report?.calls}; descartes:`,
    JSON.stringify(passo.report?.discarded.map((d) => `${d.path}: ${d.reason}`), null, 2),
  );
  return { data, pdf };
}

/** O texto que o modelo ESCREVEU — sem as citações, que copiam a transcrição. */
const textoTodo = (data: DocumentData) =>
  JSON.stringify(data, (chave, valor) => (chave === 'quotes' || chave === 'agreement' ? undefined : valor));

describe.skipIf(!AO_VIVO)('Ata de Review ao vivo (reunião sintética com gabarito)', { timeout: 300_000 }, () => {
  it('Ata do Review: decisões certas, hipótese e número fora de fato, pendências em aberto', async () => {
    const { data, pdf } = await gerarAta();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(data.executiveSummary?.length ?? 0).toBeGreaterThan(0);

    // Armadilha A: decisão revertida. Só a última vale — exportar fica na versão um.
    const decisoes = (data.decisions ?? []).map((d) => d.text).join(' | ');
    expect(decisoes).toMatch(/exportar/i);
    expect(decisoes).not.toMatch(/exportar.*(vers[ãa]o|v)\s*dois|exportar.*\bv2\b/i);

    // Armadilha B: modo escuro é proposta sem data, não decisão nem ação.
    expect(decisoes).not.toMatch(/modo escuro/i);
    const acoes = data.actionItems ?? [];
    expect(acoes.map((a) => a.acao).join(' | ')).not.toMatch(/modo escuro/i);

    // Armadilha C: ordem aceita com dono e prazo.
    const mensagem = acoes.find((a) => /CNPJ/i.test(a.acao));
    expect(mensagem, 'a ação da mensagem de erro do CNPJ').toBeDefined();
    if (mensagem?.responsavel) expect(mensagem.responsavel).toMatch(/Yasmin/);
    if (mensagem?.prazo) expect(mensagem.prazo).toMatch(/sexta/i);

    // Armadilha D: hipótese não vira causa.
    expect(textoTodo(data)).not.toMatch(/causa[^.]{0,40}cache|cache[^.]{0,40}causa/i);

    // Armadilha E: gravidade não dita não se deduz.
    expect(textoTodo(data)).not.toMatch(/\b(cr[ií]tic[oa]|bloqueante)\b/i);

    // Armadilha F: número de passagem não vira meta acordada.
    expect(textoTodo(data)).not.toMatch(/(meta|acordad[oa]|combinad[oa])[^.]{0,30}\b(2|4|quatro)\s*(s|seg)/i);

    // Armadilha H: Marcelo não participou. Armadilha I: cargo só para quem disse.
    const nomes = (data.participants ?? []).map((p) => p.name);
    expect(nomes.join(' ')).not.toMatch(/Marcelo/);
    for (const p of data.participants ?? []) {
      if (!/Otávio|Otavio/.test(p.name)) expect(p.role, `cargo de ${p.name}`).toBeUndefined();
    }

    // Pendências: filtro por data, contraste, duplicado, telefone e lentidão.
    // Se o Auditor derrubar as pendências como se fossem fato, cai aqui.
    expect(data.openPoints?.length ?? 0, 'em aberto').toBeGreaterThan(2);
  });
});
