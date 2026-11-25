// A grade de contextos e os ajustes do assistente na extensão, em duas larguras.
//
// Dados [TESTE] semeados direto no storage. Nenhuma chamada de IA: o que se
// verifica é a tela, o preenchimento à mão, o que cada botão grava e se o que
// foi gravado volta ao recarregar, e a migração do perfil antigo (versão 4).
// Perfil isolado: nunca escreve no perfil pessoal do navegador.
//
//   npx vite build --mode development --outDir <pasta>
//   node scripts/verify-preparar.cjs <playwright-core> <pasta>
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || process.argv[2] || 'playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const extensao = path.resolve(process.argv[3] || 'dist-dev');
const saida = path.resolve(process.env.SAIDA || 'docs/verification/preparar');
fs.mkdirSync(saida, { recursive: true });

const REUNIAO = {
  id: 'teste-preparar',
  title: '[TESTE] Descoberta com a Prefeitura',
  startedAt: Date.parse('2026-10-06T13:00:00Z'),
  endedAt: Date.parse('2026-10-06T13:30:00Z'),
  durationSeconds: 1800,
  participants: [{ name: 'Júlia — teste', isHost: true }],
  segments: [
    { captionId: 't-0', speaker: 'Júlia — teste', text: 'Acho que precisamos de um aplicativo.', startOffsetMs: 0, endOffsetMs: 4000 },
  ],
  status: 'ready',
  metadata: { capturedCaptions: true, droppedSegments: 0, reconnectCount: 0, wasDiscardedAndRestarted: false },
};

const verificacoes = {};
const falhas = [];

(async () => {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'taqciti-preparar-'));
  const context = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`],
    viewport: { width: 1440, height: 1000 },
  });
  const tentar = async (etapa, fn) => {
    try {
      await fn();
    } catch (e) {
      falhas.push(`${etapa}: ${e.message.split('\n')[0]}`);
      console.log(`! ${etapa}: ${e.message.split('\n')[0]}`);
    }
  };
  const guardado = (page) =>
    page.evaluate(async () => (await chrome.storage.local.get('taq:conducao'))['taq:conducao'] ?? null);
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const raiz = `chrome-extension://${new URL(worker.url()).host}`;
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(`${raiz}/src/home/index.html`);
    await page.locator('.tq-home').waitFor();
    await page.evaluate(async (r) => chrome.storage.local.set({ 'taq:history': [r] }), REUNIAO);

    await tentar('Preparar: abre no Padrão do CITi, só leitura, e nada é salvo ao abrir', async () => {
      await page.goto(`${raiz}/src/home/index.html?secao=preparar`);
      await page.getByRole('heading', { name: 'Contexto', exact: true }).waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      verificacoes.titulo_da_pagina = await page.getByRole('heading', { name: 'Preparar', exact: true }).innerText();
      verificacoes.contextos_do_padrao = await page.locator('.tq-contexto-botao[aria-expanded]').allInnerTexts();
      verificacoes.adicionar_disponivel = await page.getByRole('button', { name: 'Adicionar contexto' }).isEnabled();
      verificacoes.painel_recolhido = (await page.locator('.tq-ed').count()) === 0;
      // 23/10/2026: 100% válido para todas as reuniões — sem escolher uma reunião.
      verificacoes.sem_preparar_uma_reuniao = (await page.getByRole('heading', { name: 'Preparar uma reunião' }).count()) === 0;
      verificacoes.sem_taq_no_texto = !/\bTaq\b|Mente/.test(await page.locator('.tq-prep').innerText());
      verificacoes.colunas_em_1440 = await page.locator('.tq-contextos-grade').evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(' ').length,
      );
      verificacoes.nada_salvo_ao_abrir = ((await guardado(page))?.perfil ?? null) === null; // true = nada foi salvo
      await page.screenshot({ path: path.join(saida, 'preparar-1440-padrao.png'), fullPage: true });
    });

    await tentar('Preparar: os ajustes mostram o modo fixo e as regras', async () => {
      await page.getByRole('button', { name: 'Ajustes do assistente' }).click();
      await page.waitForTimeout(400);
      verificacoes.foco_nos_ajustes = await page.locator('.tq-ed').evaluate((el) => el === document.activeElement);
      verificacoes.padrao_escolhido = (await page.locator('.tq-levar-modos [aria-pressed="true"]').innerText()).trim();
      verificacoes.modo_fixo = await page.locator('.tq-ed-modo-fixo').innerText();
      verificacoes.sem_escolha_de_modo = (await page.locator('.tq-prep input[type="radio"]').count()) === 0;
      verificacoes.sem_busca_na_internet = !/Busca na internet/.test(await page.locator('.tq-prep').innerText());
      verificacoes.regras = await page.locator('.tq-ed-regras b').allInnerTexts();
      await page.locator('.tq-ed').screenshot({ path: path.join(saida, 'preparar-1440-ajustes.png') });
    });

    await tentar('Preparar: personalizar, adicionar e editar; só "Usar este assistente" grava', async () => {
      await page.getByRole('button', { name: 'Adicionar contexto' }).click();
      await page.locator('.tq-ed-campo input').fill('[TESTE] Escopo do Portal');
      await page.locator('.tq-ed-campo textarea').fill('Primeira entrega: cadastro de voluntários e painel da coordenação. Ficam fora: app mobile e pagamentos.');
      verificacoes.contador = await page.locator('.tq-ed-conta').innerText();
      verificacoes.nada_salvo_antes_de_usar = ((await guardado(page))?.perfil ?? null) === null; // true = nada foi salvo
      verificacoes.status_pendente = await page.locator('.tq-levar-status').innerText();
      await page.screenshot({ path: path.join(saida, 'preparar-1440-editando.png'), fullPage: true });
      await page.getByRole('button', { name: 'Usar este assistente' }).click();
      await page.waitForTimeout(500);
      const g = await guardado(page);
      verificacoes.perfil_gravado = {
        base: g?.perfil?.base,
        revisao: g?.perfil?.revisao,
        contextos: g?.perfil?.contextos?.map((c) => `${c.nome} [${c.origem}${c.ligado ? '' : ', guardado'}] vaga ${c.vaga}`),
      };
      verificacoes.status_salvo = await page.locator('.tq-levar-status').innerText();
    });

    await tentar('Preparar: guardar um contexto muda o visual e o que vai', async () => {
      await page.locator('.tq-contexto-botao', { hasText: 'Uma pergunta por vez' }).click();
      await page.locator('.tq-ed .tq-interruptor input').click();
      verificacoes.guardado_tem_classe = await page.locator('.tq-contexto-botao', { hasText: 'Uma pergunta por vez' }).evaluate((n) => n.classList.contains('guardado'));
      await page.getByRole('button', { name: 'Usar este assistente' }).click();
      await page.waitForTimeout(500);
      verificacoes.guardado_gravado = (await guardado(page))?.perfil?.contextos?.find((c) => c.nome === 'Uma pergunta por vez')?.ligado === false;
      await page.screenshot({ path: path.join(saida, 'preparar-1440-personalizado.png'), fullPage: true });
    });

    await tentar('Preparar: o assistente volta ao recarregar', async () => {
      await page.reload();
      await page.getByRole('heading', { name: 'Contexto', exact: true }).waitFor();
      await page.waitForTimeout(400);
      verificacoes.voltou_personalizado = await page.getByRole('button', { name: '[TESTE] Escopo do Portal' }).isVisible();
      verificacoes.sem_salvar_quando_sem_edicao = (await page.getByRole('button', { name: 'Usar este assistente' }).count()) === 0;
    });

    await tentar('HOME estreita (390px): grade em duas colunas sem rolagem lateral', async () => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`${raiz}/src/home/index.html?secao=preparar`);
      await page.getByRole('heading', { name: 'Contexto', exact: true }).waitFor();
      await page.waitForTimeout(500);
      verificacoes.colunas_em_390 = await page.locator('.tq-contextos-grade').evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(' ').length,
      );
      verificacoes.sem_rolagem_lateral_390 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await page.screenshot({ path: path.join(saida, 'preparar-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'Ajustes do assistente' }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(saida, 'preparar-390-ajustes.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    /*
     * "Ajustes sugeridos" e "Testar o assistente numa reunião passada" saíram em
     * 23/11/2026. Com retornos guardados e uma reunião longa, nenhum dos dois
     * pode voltar a aparecer.
     */
    const apoioCom = (tipo, n) => ({
      versao: 1,
      sugestoes: [],
      feedback: Array.from({ length: n }, (_, i) => ({
        id: `fb-teste-${tipo}-${i}`,
        sugestaoId: `sug-teste-${i}`,
        reuniaoId: REUNIAO.id,
        em: Date.now() - 1000 * (n - i),
        tipo,
        alcance: 'agora',
      })),
      pausadas: {},
      medicoes: {},
      ajustes: {},
    });
    const abrirPreparar = async () => {
      await page.goto(`${raiz}/src/home/index.html?secao=preparar`);
      await page.getByRole('heading', { name: 'Contexto', exact: true }).waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
    };

    await tentar('Preparar: sem "Ajustes sugeridos" nem "Testar numa reunião passada", mesmo com retornos e reunião longa', async () => {
      const longa = {
        ...REUNIAO,
        id: 'teste-preparar-longa',
        title: '[TESTE] Reunião longa para reproduzir',
        segments: Array.from({ length: 6 }, (_, i) => ({
          captionId: `l-${i}`,
          speaker: 'Júlia — teste',
          text: `Fala sintética número ${i + 1}.`,
          startOffsetMs: i * 20000,
          endOffsetMs: i * 20000 + 9000,
        })),
      };
      await page.evaluate(async (r) => chrome.storage.local.set({ 'taq:history': r }), [REUNIAO, longa]);
      await page.evaluate(async (a) => chrome.storage.local.set({ 'taq:apoio': a }), apoioCom('ja_respondido', 3));
      await abrirPreparar();
      const texto = await page.locator('.tq-prep').innerText();
      verificacoes.sem_ajustes_sugeridos = !/Ajustes sugeridos/.test(texto);
      verificacoes.sem_testar_reuniao_passada = !/Testar o assistente numa reunião passada|Reproduzir/.test(texto);
    });
    /*
     * A migração da versão 4 contra a extensão de verdade: um perfil no formato
     * anterior, a versão do storage em 3, e a extensão recarregada (é no início
     * do background que as migrações rodam).
     */
    await tentar('Migração v4: o perfil antigo vira contextos ao reiniciar a extensão', async () => {
      await page.evaluate(async () =>
        chrome.storage.local.set({
          'taq:storageSchemaVersion': 3,
          'taq:conducao': {
            versao: 1,
            perfil: {
              missao: '[TESTE] Apoiar reuniões de descoberta.',
              observar: ['Impacto', 'Processo atual'],
              intervencao: { modo: 'participativo', estilo: 'Uma pergunta curta por vez' },
              contexto: [],
              preferencias: ['Explicar o motivo só quando eu pedir'],
              lerAoEncerrar: true,
              revisao: 4,
              criadoEm: 1,
              atualizadoEm: 2,
              historico: [],
            },
            briefings: [],
          },
        }),
      );
      const novoWorker = context.waitForEvent('serviceworker', { timeout: 20000 });
      await page.evaluate(() => chrome.runtime.reload()).catch(() => {});
      await novoWorker;
      // A aba antiga fechou junto com a extensão: espera fora dela.
      await new Promise((r) => setTimeout(r, 800));
      const nova = await context.newPage();
      await nova.goto(`${raiz}/src/home/index.html?secao=preparar`);
      await nova.getByRole('heading', { name: 'Contexto', exact: true }).waitFor();
      const bruto = await nova.evaluate(async () => chrome.storage.local.get(['taq:conducao', 'taq:storageSchemaVersion']));
      const p = bruto['taq:conducao']?.perfil;
      verificacoes.migracao_v4 = {
        versaoDoStorage: bruto['taq:storageSchemaVersion'],
        base: p?.base,
        revisao: p?.revisao,
        modo: p?.intervencao?.modo,
        lerAoEncerrar: p?.lerAoEncerrar,
        contextos: p?.contextos?.map((c) => `${c.nome}: ${c.texto}`),
        guardouOriginal: bruto['taq:conducao']?.perfilV1?.coubeInteiro,
      };
      await nova.waitForTimeout(400);
      await nova.screenshot({ path: path.join(saida, 'preparar-1440-migrado.png'), fullPage: true });
      await nova.close();
    });

    verificacoes.erros_de_pagina = erros;
  } finally {
    await context.close();
  }

  fs.writeFileSync(path.join(saida, 'resultado.json'), JSON.stringify({ verificacoes, falhas }, null, 2));
  console.log(JSON.stringify({ verificacoes, falhas }, null, 2));
  process.exit(falhas.length ? 1 : 0);
})();
