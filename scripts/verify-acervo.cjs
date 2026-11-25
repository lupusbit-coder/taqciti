/*
 * As buscas do acervo (Reuniões, Conversas, Documentos) contra a extensão
 * RODANDO, em perfil descartável e só com dados sintéticos semeados no storage.
 *
 * Até 23/11/2026 os dados vinham de "Importar reunião" e das "Automações após
 * reuniões", que saíram da aba Reuniões. Agora são semeados direto, e a volta
 * confere também que os dois blocos não aparecem mais.
 *
 *   npx vite build --mode development --outDir <pasta>
 *   node scripts/verify-acervo.cjs <playwright-core> <pasta>
 */
const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AGORA = Date.now();
const REUNIAO = {
  id: 'teste-acervo',
  title: '[TESTE] Revisão da API',
  startedAt: AGORA - 3_600_000,
  endedAt: AGORA - 1_800_000,
  durationSeconds: 1800,
  participants: [{ name: 'Ana — teste', isHost: true }],
  segments: [
    { captionId: 'a-0', speaker: 'Ana — teste', text: 'Ana vai revisar a API amanhã.', startOffsetMs: 0, endOffsetMs: 3000 },
    { captionId: 'a-1', speaker: 'Ana — teste', text: 'Uma decisão importante.', startOffsetMs: 4000, endOffsetMs: 6000 },
  ],
  status: 'ready',
  metadata: { capturedCaptions: true, droppedSegments: 0, reconnectCount: 0, wasDiscardedAndRestarted: false },
};
const DOCUMENTO = {
  id: 'doc-acervo',
  title: '[TESTE] Resumo da reunião',
  content: '# Resumo\n\nRevisão da API combinada para amanhã.',
  formato: 'markdown',
  createdAt: AGORA - 1_000_000,
  updatedAt: AGORA - 1_000_000,
  meetingId: REUNIAO.id,
};

(async () => {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'taqciti-acervo-'));
  const extensao = path.resolve(process.argv[3] || 'dist-dev');
  const contexto = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`],
    viewport: { width: 1280, height: 900 },
  });
  const erros = [];
  try {
    const worker = contexto.serviceWorkers()[0] || await contexto.waitForEvent('serviceworker');
    // Nada aqui chama IA: qualquer rota do servidor responde indisponível.
    await contexto.route('**/api/**', (route) => route.fulfill({ status: 503, body: '{}' }));
    const pagina = await contexto.newPage();
    pagina.on('pageerror', (e) => erros.push(e.message));
    const base = `chrome-extension://${new URL(worker.url()).host}/src/home/index.html`;
    await pagina.goto(`${base}?secao=reunioes`);
    await pagina.locator('.tq-home').waitFor();
    await pagina.evaluate(async ({ r, d }) => chrome.storage.local.set({
      'taq:history': [r],
      'taq:documents': [d],
      'taq:conversations': [{ id: 'conversa-teste', title: 'Nome anterior', createdAt: 1, updatedAt: 1,
        messages: [{ id: 'm1', role: 'user', text: 'Conversa sobre acessibilidade', at: 1 }] }],
    }), { r: REUNIAO, d: DOCUMENTO });

    await pagina.reload();
    await pagina.getByRole('heading', { name: 'Reuniões', exact: true }).waitFor();
    const texto = await pagina.locator('.tq-pagina').innerText();
    assert(!/Importar reunião|Automações após reuniões/.test(texto), 'os blocos removidos voltaram a aparecer');
    console.log('PASS Reuniões sem "Importar reunião" nem "Automações após reuniões"');

    // A busca filtra 250 ms depois da digitação: a contagem espera.
    const contar = (n) => pagina.waitForFunction((n) => document.querySelectorAll('.tq-linha-reuniao').length === n, n);
    const campo = pagina.getByRole('searchbox', { name: 'Buscar pelo nome da reunião', exact: true });
    await campo.fill('revisao API');
    await contar(1);
    await campo.fill('inexistente');
    await contar(0);
    await pagina.getByRole('button', { name: 'Limpar busca' }).first().click();
    await contar(1);
    console.log('PASS busca de reuniões pelo nome, sem acento, e "Limpar busca"');

    await pagina.getByRole('button', { name: 'Conversas', exact: true }).click();
    await pagina.getByRole('searchbox', { name: 'Buscar conversas', exact: true }).fill('acessibilidade');
    await pagina.getByRole('menuitem', { name: 'Renomear a conversa "Nome anterior"' }).click();
    await pagina.getByLabel('Nome da conversa', { exact: true }).fill('Revisão semanal');
    await pagina.getByRole('button', { name: 'Salvar nome', exact: true }).click();
    await pagina.getByRole('menuitemradio', { name: /Revisão semanal/ }).waitFor();
    await pagina.reload();
    await pagina.getByRole('button', { name: 'Conversas', exact: true }).click();
    await pagina.getByRole('menuitemradio', { name: /Revisão semanal/ }).waitFor();
    console.log('PASS busca de conversas, renomeação e persistência após recarregar');
    await pagina.getByRole('button', { name: 'Conversas', exact: true }).click();

    await pagina.goto(`${base}?secao=documentos`);
    await pagina.getByRole('searchbox', { name: 'Buscar pelo nome do documento', exact: true }).fill('resumo da reuniao');
    await pagina.locator('.tq-estante .tq-item-linha').first().waitFor();
    console.log('PASS busca de documentos pelo nome');

    for (const largura of [390, 320]) {
      await pagina.setViewportSize({ width: largura, height: 844 });
      await pagina.goto(`${base}?secao=reunioes`);
      await pagina.locator('.tq-linha-reuniao').first().waitFor();
      assert(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await pagina.screenshot({ path: path.join(perfil, `reunioes-${largura}.png`), fullPage: true });
    }
    assert.deepEqual(erros, []);
    console.log('PASS responsividade 390/320 px, sem erros de página');
    console.log('Capturas:', perfil);
  } finally { await contexto.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
