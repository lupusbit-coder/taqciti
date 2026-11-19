// Os estados que nenhum outro verificador fotografa — contra a extensão RODANDO,
// a 1440 e a 390 px. Nasceu da troca do reset de botão da HOME (`:where`, ver
// home.css), que mudou a aparência de ~70 botões, alguns em telas que só
// aparecem com conta conectada.
//
// Sem IA, sem servidor e sem conta real:
//   - a identidade do Google é simulada SÓ nesta página de teste: um init
//     script troca `chrome.identity.launchWebAuthFlow` por uma função que
//     devolve um id_token [TESTE] com o mesmo `nonce` pedido (ou falha, para a
//     sessão vencida). O service worker não é tocado;
//   - as rotas do servidor (`/api/conector/token`, `/api/generate`) são
//     interceptadas com `page.route`, como em verify-ajuda.cjs.
// O e-mail da conta é inventado, mas precisa terminar em @citi.org.br: o
// produto recusa qualquer outra conta (`contaEhDoCiti`). Destinatários e
// endereços do servidor usam `.invalid`.
//
// A build precisa de VITE_GOOGLE_OAUTH_WEB_CLIENT_ID e VITE_GOOGLE_OAUTH_CLIENT_ID
// (valores fictícios bastam): sem eles a tela mostra "login não configurado" e
// nenhum destes estados existe.
//
// Uso (da raiz do repositório):
//   node scripts/verify-estados.cjs <caminho do playwright-core> <pasta da build>
// Saída: docs/verification/estados/*.png e resultado.json (`falhas` vazio = ok).

const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || process.argv[2] || 'playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const extensao = path.resolve(process.argv[3] || 'dist-dev');
const saida = path.resolve('docs/verification/estados');
fs.mkdirSync(saida, { recursive: true });

const EMAIL = 'pessoa.teste@citi.org.br';
const agora = Date.parse('2026-11-11T12:00:00Z');

const REUNIAO = {
  id: 'teste-estados',
  title: '[TESTE] Revisão do protótipo',
  startedAt: Date.parse('2026-11-10T13:00:00Z'),
  endedAt: Date.parse('2026-11-10T13:30:00Z'),
  durationSeconds: 1800,
  participants: [{ name: 'Júlia — teste', isHost: true }, { name: 'Marcos — teste', isHost: false }],
  segments: [
    ['Júlia — teste', '[TESTE] A fase 1 entrega só a visualização dos relatórios.'],
    ['Marcos — teste', '[TESTE] Eu fico com o protótipo navegável até sexta-feira.'],
    ['Júlia — teste', '[TESTE] Alguém precisa escrever os critérios de aceite.'],
  ].map(([speaker, text], i) => ({ captionId: `e-${i}`, speaker, text, startOffsetMs: i * 20000, endOffsetMs: i * 20000 + 9000 })),
  status: 'ready',
  metadata: { capturedCaptions: true, droppedSegments: 0, reconnectCount: 0, wasDiscardedAndRestarted: false },
};
const ev = (i) => ({
  tipo: 'reuniao',
  registroId: REUNIAO.id,
  titulo: REUNIAO.title,
  versao: `${REUNIAO.endedAt}:3`,
  trecho: REUNIAO.segments[i].text,
  segmento: i,
  offsetMs: REUNIAO.segments[i].startOffsetMs,
});
const base = (id, chave, i) => ({
  id,
  chave,
  revisao: 1,
  criadoEm: agora,
  atualizadoEm: agora,
  historico: [{ em: agora, acao: 'registrado', origem: 'taq' }],
  evidencias: [ev(i)],
  reuniaoId: REUNIAO.id,
});
const TRABALHO = {
  versao: 1,
  compromissos: [
    { ...base('k-1', 'compromisso:estados:1', 1), descricao: '[TESTE] Entregar o protótipo navegável', responsavel: { nome: 'Marcos — teste', confirmado: true }, prazo: { texto: 'até sexta-feira', data: '2026-11-13' }, estado: 'aberto', dependeDe: [] },
    { ...base('k-2', 'compromisso:estados:2', 2), descricao: '[TESTE] Escrever os critérios de aceite', responsavel: null, prazo: null, estado: 'aberto', dependeDe: ['k-1'] },
  ],
  decisoes: [{ ...base('d-1', 'decisao:estados:1', 0), assunto: 'Escopo', texto: '[TESTE] A fase 1 é só visualização', estado: 'confirmada' }],
  achados: [
    {
      ...base('a-1', 'achado:estados:1', 0),
      tipo: 'desalinhamento',
      assunto: '[TESTE] Exportação em PDF',
      entendimentos: [
        { area: 'Comercial', texto: 'prometeu PDF na fase 1', evidencia: ev(0) },
        { area: 'Produto', texto: 'fase 1 só com visualização', evidencia: ev(0) },
      ],
      impacto: 'o cliente pode esperar o PDF na primeira entrega',
      pergunta: 'O PDF entra na fase 1 ou na 2?',
      classificacao: 'possivel',
      estado: 'aberto',
    },
  ],
  analises: [],
};
const CONVERSA_ID = 'c-teste-estados';
const CONVERSA = {
  id: CONVERSA_ID,
  title: '[TESTE] Ações externas',
  createdAt: agora - 60_000,
  updatedAt: agora,
  messages: [
    { id: 'u1', role: 'user', text: '[TESTE] Mande o resumo para a Júlia e marque a revisão.', at: agora - 60_000 },
    {
      id: 'r1',
      role: 'assistant',
      text: '[TESTE] Resposta semeada para a verificação da tela — sem IA.',
      at: agora,
      desfecho: 'concluido',
      cartoes: [
        {
          tipo: 'rascunho_de_mensagem',
          canal: 'email',
          publico: 'interno',
          destinatarios: [{ nome: 'Júlia — teste', endereco: 'julia@teste.invalid', situacao: 'verificado' }],
          assunto: '[TESTE] Resumo da revisão',
          corpo: 'Oi, Júlia!\n\n[TESTE] A fase 1 fica só com a visualização.',
          alertas: [],
          chaveDoRascunho: 'r-email-1',
        },
        { tipo: 'acao_externa', operacao: 'email', estado: 'aguardando_confirmacao', titulo: '[TESTE] Resumo da revisão', linhas: ['Para: Júlia — teste'], alertas: [], chaveDoRascunho: 'r-email-1' },
        { tipo: 'acao_externa', operacao: 'evento_criar', estado: 'aguardando_confirmacao', titulo: '[TESTE] Revisão do escopo', linhas: ['sex., 13/11, 14:00 — 30 min', 'Convidados: Júlia — teste'], alertas: [], chaveDoRascunho: 'r-evento-1' },
        { tipo: 'acao_externa', operacao: 'email', estado: 'falhou', titulo: '[TESTE] Envio recusado', linhas: ['Para: Marcos — teste'], alertas: ['[TESTE] O Google recusou o envio.'], chaveDoRascunho: 'r-email-2' },
        { tipo: 'acao_externa', operacao: 'evento_criar', estado: 'desconhecido', titulo: '[TESTE] Evento sem resposta', linhas: ['qui., 12/11, 10:00 — 30 min'], alertas: [], chaveDoRascunho: 'r-evento-2' },
        { tipo: 'acao_externa', operacao: 'evento_criar', estado: 'aceito', titulo: '[TESTE] Evento criado', linhas: ['qua., 11/11, 16:00 — 30 min'], alertas: [], link: 'https://calendar.google.com/calendar/event?eid=teste' },
        { tipo: 'sugestoes_de_compromisso', reuniaoId: REUNIAO.id, itens: [{ descricao: '[TESTE] Revisar o contrato', responsavel: null, prazo: null, evidencias: [ev(2)] }] },
        { tipo: 'achados', ids: ['a-1'] },
        {
          tipo: 'sugestao_de_evento',
          titulo: '[TESTE] Revisão do escopo',
          duracaoMin: 30,
          fuso: 'America/Recife',
          participantes: ['Júlia — teste'],
          opcoes: [{ inicio: '2026-11-13T17:00:00.000Z', fim: '2026-11-13T17:30:00.000Z', rotulo: 'sex., 13/11, 14:00' }],
        },
      ],
    },
  ],
};
const rascunho = (chave, tipo, estado) => ({
  chave,
  tipo,
  estado,
  execucaoId: 'x-teste',
  conversaId: CONVERSA_ID,
  criadoEm: agora,
  atualizadoEm: agora,
  payload: {},
});
const ACOES = Object.fromEntries(
  [
    rascunho('r-email-1', 'email', 'rascunho'),
    rascunho('r-evento-1', 'evento_criar', 'rascunho'),
    rascunho('r-email-2', 'email', 'falhou'),
    rascunho('r-evento-2', 'evento_criar', 'desconhecido'),
  ].map((r) => [r.chave, r]),
);
const ESCOPOS = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
const CONEXAO = { email: EMAIL, dominio: 'citi.org.br', escopos: ESCOPOS, concedidoEm: agora, desligadas: [] };
const DOCUMENTO = {
  id: 'doc-estados',
  title: '[TESTE] Ata da revisão',
  content: '# [TESTE] Ata da revisão\n\n[TESTE] Conteúdo de verificação.',
  formato: 'markdown',
  createdAt: agora,
  updatedAt: agora,
  meetingId: REUNIAO.id,
  tipo: 'Ata de Reunião',
  origem: 'gerado',
};

const verificacoes = {};
const falhas = [];
const vistos = [];

(async () => {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'taqciti-estados-'));
  const context = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`],
    viewport: { width: 1440, height: 1000 },
  });

  // A identidade simulada. `localStorage['teste:login']` escolhe o desfecho:
  // 'ok' devolve um id_token [TESTE]; qualquer outra coisa falha em silêncio,
  // que é o que o Google faz quando a sessão venceu.
  await context.addInitScript((email) => {
    const id = globalThis.chrome && globalThis.chrome.identity;
    if (!id) return;
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    id.launchWebAuthFlow = (det, cb) => {
      const nonce = new URL(det.url).searchParams.get('nonce');
      setTimeout(() => {
        if (localStorage.getItem('teste:login') !== 'ok') return cb(undefined);
        const payload = { email, hd: 'citi.org.br', nonce, exp: Math.floor(Date.now() / 1000) + 3600 };
        cb(`https://teste.chromiumapp.org/#id_token=${b64({ alg: 'none' })}.${b64(payload)}.teste`);
      }, 30);
    };
  }, EMAIL);

  // O servidor do conector, simulado: a lista vive aqui, no script.
  let tokens = [];
  let falharGeracao = false;
  await context.route('**/api/conector/token**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: EMAIL, tokens }) });
    if (req.method() === 'POST') {
      if (falharGeracao) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '[TESTE] O servidor recusou gerar o endereço.' }) });
      const { rotulo } = JSON.parse(req.postData() || '{}');
      const id = `t-${tokens.length + 1}`;
      tokens.push({ id, rotulo: rotulo ?? null, criadoEm: new Date(agora).toISOString(), usadoEm: null });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, token: 'teste-token-ficticio', url: `https://servidor.invalid/mcp/${id}` }) });
    }
    if (req.method() === 'DELETE') {
      const id = new URL(req.url()).searchParams.get('id');
      tokens = tokens.filter((t) => t.id !== id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 405, body: '' });
  });

  const tentar = async (etapa, fn) => {
    try {
      await fn();
    } catch (e) {
      falhas.push(`${etapa}: ${e.message.split('\n')[0]}`);
      console.log(`! ${etapa}: ${e.message.split('\n')[0]}`);
    }
  };

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const raiz = `chrome-extension://${new URL(worker.url()).host}`;
    const page = await context.newPage();
    const errosDePagina = [];
    page.on('pageerror', (e) => errosDePagina.push(e.message));

    const ir = async (secao) => {
      await page.goto(`${raiz}/src/home/index.html?secao=${secao}`);
      await page.locator('.tq-home').waitFor();
      await page.waitForTimeout(700);
    };
    /** Print a 1440 e a 390 da tela como está; anota rolagem lateral. */
    const duas = async (nome, preparar) => {
      for (const [l, a] of [[1440, 1000], [390, 844]]) {
        await page.setViewportSize({ width: l, height: a });
        if (preparar) await preparar();
        await page.waitForTimeout(400);
        const arquivo = `${nome}-${l}.png`;
        await page.screenshot({ path: path.join(saida, arquivo), fullPage: true });
        vistos.push(arquivo);
        const semLateral = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        if (!semLateral) falhas.push(`${arquivo}: rolagem lateral`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    };
    const semear = (dados) => page.evaluate((d) => chrome.storage.local.set(d), dados);
    const login = (modo) => page.evaluate((m) => localStorage.setItem('teste:login', m), modo);

    await ir('assistente');

    // ------------------------------------------------ primeiro uso, vazio
    await tentar('Home vazia', () => duas('home-vazia'));

    await semear({
      'taq:history': [REUNIAO],
      'taq:trabalho': TRABALHO,
      'taq:conversations': [CONVERSA],
      'taq:documents': [DOCUMENTO],
      'taq:acoes-externas': ACOES,
    });

    // --------------------------------------------------------- Conexões
    await tentar('Conexões: entrou, sem sincronizar', async () => {
      await login('ok');
      await semear({ 'taq:contaDaIa': { email: EMAIL } });
      await ir('conexoes');
      verificacoes.login_dentro = (await page.getByText(EMAIL).count()) > 0;
      await duas('conexoes-entrou');
    });

    await tentar('Conexões: sessão vencida', async () => {
      await login('falha');
      await ir('conexoes');
      verificacoes.login_vencido = (await page.getByText('venceu').count()) > 0;
      await duas('conexoes-sessao-vencida');
    });

    await tentar('Conexões: sincronização ligada, sessão vencida', async () => {
      await semear({ 'taq:sync': { ligada: true, email: EMAIL, emMs: agora } });
      await ir('conexoes');
      verificacoes.sync_precisa_permissao = (await page.getByText('sincronização parou').count()) > 0;
      await duas('conexoes-sync-vencida');
    });

    await tentar('Conexões: Conta do CITi conectada e sincronização ligada', async () => {
      await login('ok');
      await semear({
        'taq:integracoes': CONEXAO,
        'taq:syncEstado': { ultimoSucessoEm: agora - 5 * 60_000, ultimaPassada: { ok: true, em: agora - 5 * 60_000 }, uso: { bytes: 3_200_000, cota: 50_000_000 } },
      });
      await ir('conexoes');
      verificacoes.conta_do_citi_conectada = (await page.getByText('Conta do CITi').count()) > 0;
      // O service worker não usa a identidade simulada: a passada dele falha por
      // "sessão" e grava isso no estado do sync. Regrava o estado de uma passada
      // boa logo antes do print, para a tela mostrar o caso que se quer ver.
      const syncBom = { ultimoSucessoEm: agora - 5 * 60_000, ultimaPassada: { ok: true, em: agora - 5 * 60_000 }, uso: { bytes: 3_200_000, cota: 50_000_000 } };
      await duas('conexoes-tudo-ligado', () => semear({ 'taq:syncEstado': syncBom }));
    });

    await tentar('Conexões: gerar endereço para o Claude', async () => {
      await ir('conexoes');
      await page.locator('.tq-hub-tile').filter({ hasText: 'Claude' }).getByRole('button', { name: 'Conectar' }).click();
      await duas('conexoes-claude-antes-de-gerar');
      await page.getByRole('button', { name: 'Gerar endereço' }).click();
      await page.getByText('servidor.invalid').first().waitFor({ timeout: 5000 }).catch(() => undefined);
      verificacoes.endereco_novo_na_tela = (await page.locator('input[value*="servidor.invalid"]').count()) > 0;
      await duas('conexoes-claude-endereco-novo');
    });

    await tentar('Conexões: erro ao gerar (ChatGPT)', async () => {
      falharGeracao = true;
      await ir('conexoes');
      await page.locator('.tq-hub-tile').filter({ hasText: 'ChatGPT' }).getByRole('button', { name: 'Conectar' }).click();
      await page.getByRole('button', { name: 'Gerar endereço' }).click();
      await page.getByText('[TESTE] O servidor recusou').first().waitFor({ timeout: 5000 });
      await duas('conexoes-gerar-erro');
      falharGeracao = false;
    });

    await tentar('Conexões: endereços ativos e confirmação de revogar', async () => {
      tokens.push({ id: 't-gpt', rotulo: 'ChatGPT', criadoEm: new Date(agora).toISOString(), usadoEm: new Date(agora).toISOString() });
      await ir('conexoes');
      await duas('conexoes-enderecos-ativos');
      await page.locator('.tq-hub-lista li').filter({ hasText: 'Claude' }).getByRole('button', { name: 'Revogar' }).click();
      await duas('conexoes-revogar-confirma');
      await page.locator('.tq-hub-lista li').filter({ hasText: 'Claude' }).getByRole('button', { name: 'Cancelar' }).click();
    });

    // -------------------------------------------- cartões de ação externa
    await tentar('HOME: cartões de ação externa', async () => {
      await ir('assistente');
      await page.locator('.tq-cartoes').waitFor({ timeout: 10000 });
      verificacoes.botoes_de_acao = await page.locator('.tq-c-acoes button').allInnerTexts();
      await duas('cartoes-acao-home');
    });

    await tentar('Sidebar: cartões de ação externa', async () => {
      const lado = await context.newPage();
      await lado.setViewportSize({ width: 400, height: 900 });
      await lado.goto(`${raiz}/src/sidepanel/index.html`);
      await lado.waitForTimeout(1200);
      const seletor = lado.getByRole('button', { name: 'Escolher conversa' });
      if (await seletor.count()) {
        await seletor.first().click();
        await lado.getByText(CONVERSA.title).first().click({ timeout: 5000 });
        await lado.waitForTimeout(600);
      }
      await lado.screenshot({ path: path.join(saida, 'cartoes-acao-sidebar-400.png'), fullPage: true });
      vistos.push('cartoes-acao-sidebar-400.png');
      if (!(await lado.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)))
        falhas.push('cartoes-acao-sidebar-400.png: rolagem lateral');
      await lado.close();
    });

    // ------------------------------------------------ Acompanhamento
    for (const aba of ['Compromissos', 'Decisões', 'Achados']) {
      await tentar(`Acompanhamento: ${aba}`, async () => {
        await duas(`acompanhamento-${aba.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}`, async () => {
          await ir('acompanhamento');
          await page.getByRole('tab', { name: new RegExp(aba) }).click();
        });
      });
    }

    // ---------------------------------------- confirmações de apagar
    await tentar('Confirmar: apagar reunião', async () => {
      await duas('confirma-apagar-reuniao', async () => {
        await ir('reunioes');
        await page.locator('.tq-item-linha .tq-item-apagar').first().click();
        await page.locator('.tq-confirma').waitFor();
      });
    });
    await tentar('Confirmar: apagar documento', async () => {
      await duas('confirma-apagar-documento', async () => {
        await ir('documentos');
        await page.locator('.tq-item-linha .tq-item-apagar').first().click();
        await page.locator('.tq-confirma').waitFor();
      });
    });
    await tentar('Confirmar: apagar conversa', async () => {
      await duas('confirma-apagar-conversa', async () => {
        await ir('assistente');
        await page.getByRole('button', { name: 'Conversas', exact: true }).click();
        await page.locator('.tq-conversas-lista li button[aria-label^="Apagar"]').first().click();
        await page.waitForTimeout(300);
      });
    });

    // ------------------------------- botões principais: carregando e erro
    const abrirCriarAta = async () => {
      await page.goto(`${raiz}/src/home/index.html?record=${REUNIAO.id}`);
      await page.getByLabel('Nome da reunião').waitFor();
      await page.getByRole('button', { name: 'Criar documento', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Ata de Reunião', exact: true }).click();
    };
    await tentar('Criar documento: carregando', async () => {
      await page.route('**/api/generate', async (route) => {
        await new Promise((r) => setTimeout(r, 8000));
        await route.fulfill({ status: 500, body: '' }).catch(() => undefined);
      });
      await duas('criar-documento-carregando', async () => {
        await abrirCriarAta();
        await page.waitForTimeout(700);
      });
      await page.unroute('**/api/generate');
    });
    await tentar('Criar documento: erro', async () => {
      await page.route('**/api/generate', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '[TESTE] Falha simulada do servidor.' }) }),
      );
      await duas('criar-documento-erro', async () => {
        await abrirCriarAta();
        await page.waitForTimeout(1500);
      });
      await page.unroute('**/api/generate');
    });

    verificacoes.erros_de_pagina = errosDePagina;
  } finally {
    fs.writeFileSync(
      path.join(saida, 'resultado.json'),
      JSON.stringify({ quando: new Date().toISOString(), verificacoes, vistos, falhas }, null, 2),
    );
    console.log(JSON.stringify({ verificacoes, falhas, prints: vistos.length }, null, 2));
    await context.close();
  }
})();
