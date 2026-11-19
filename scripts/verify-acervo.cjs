/* Verificação em perfil descartável. Só dados sintéticos; respostas de IA simuladas. */
const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
    // O serviço externo é simulado; persistência, parser, fila, mensageria e UI são reais.
    await worker.evaluate(() => {
      globalThis.chamadasDeTeste = 0;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/api/taq/turno')) {
          globalThis.chamadasDeTeste++;
          const pedido = JSON.parse(init.body);
          return Response.json({ tipo: 'final', chamadas: [], uso: { entrada: 1, saida: 1 },
            provedor: 'teste', modelo: 'sintetico', instrucoesVersao: pedido.instrucoes, latenciaMs: 1,
            texto: JSON.stringify({ resumo: 'Resumo sintético: revisão da API.', compromissos: [
              { descricao: 'Revisar a API', segmento: 0, trecho: 'Ana vai revisar a API amanhã.', responsavel: 'Ana', prazo: 'amanhã' },
            ] }),
          });
        }
        return Response.json({}, { status: 503 });
      };
    });
    await contexto.route('**/api/**', (route) => route.fulfill({ status: 503, body: '{}' }));
    const pagina = await contexto.newPage();
    pagina.on('pageerror', (e) => erros.push(e.message));
    const base = `chrome-extension://${new URL(worker.url()).host}/src/home/index.html`;
    await pagina.goto(`${base}?secao=reunioes`);
    await pagina.getByRole('heading', { name: 'Reuniões', exact: true }).waitFor();
    await pagina.getByText('Automações após reuniões', { exact: true }).click();
    await pagina.getByLabel('Salvar resumo em Documentos', { exact: true }).check();
    await pagina.getByLabel('Sugerir próximos passos em Acompanhamento', { exact: true }).check();
    await pagina.getByText('Importar reunião', { exact: true }).click();
    const arquivo = { name: 'Teste sintético.txt', mimeType: 'text/plain', buffer: Buffer.from('Ana vai revisar a API amanhã.\nUma decisão importante.') };
    await pagina.getByLabel('Arquivo', { exact: true }).setInputFiles(arquivo);
    await pagina.getByLabel('Data e hora da reunião', { exact: true }).fill('2026-11-13T10:00');
    await pagina.getByRole('button', { name: 'Importar', exact: true }).click();
    await pagina.locator('input.tq-titulo-editavel').waitFor();
    assert.equal(await pagina.locator('input.tq-titulo-editavel').inputValue(), 'Teste sintético');
    await pagina.waitForFunction(async () => {
      const dados = await chrome.storage.local.get('taqciti:automacoes:fila:v1');
      return dados['taqciti:automacoes:fila:v1']?.[0]?.estado === 'concluida';
    });
    const registros = await pagina.evaluate(async () => chrome.storage.local.get(['taq:history', 'taq:documents', 'taq:trabalho']));
    console.log('Preferências sintéticas:', await pagina.evaluate(async () => chrome.storage.local.get(['taqciti:automacoes:v1', 'taqciti:automacoes:fila:v1'])));
    assert.equal(registros['taq:history'].length, 1);
    assert.equal(registros['taq:documents'].length, 1);
    assert.equal(registros['taq:trabalho'].compromissos[0].situacao, 'candidato');
    console.log('PASS importação real no background e automações com IA simulada');
    await pagina.goto(`${base}?secao=reunioes`);
    await pagina.getByLabel('Buscar reuniões', { exact: true }).fill('DECISAO');
    assert.equal(await pagina.locator('.tq-linha-reuniao').count(), 1);
    await pagina.getByLabel('Participante', { exact: true }).fill('Inexistente');
    assert.equal(await pagina.locator('.tq-linha-reuniao').count(), 0);
    await pagina.getByLabel('Participante', { exact: true }).fill('');
    await pagina.getByLabel('Buscar reuniões', { exact: true }).fill('');
    await pagina.getByLabel('Até', { exact: true }).fill('2026-11-12');
    assert.equal(await pagina.locator('.tq-linha-reuniao').count(), 0);
    await pagina.getByRole('button', { name: 'Limpar busca' }).click();
    await pagina.getByText('Importar reunião', { exact: true }).click();
    await pagina.getByLabel('Arquivo', { exact: true }).setInputFiles(arquivo);
    await pagina.getByLabel('Data e hora da reunião', { exact: true }).fill('2026-11-13T10:00');
    await pagina.getByRole('button', { name: 'Importar', exact: true }).click();
    await pagina.locator('input.tq-titulo-editavel').waitFor();
    assert.equal(await worker.evaluate(() => globalThis.chamadasDeTeste), 1);
    console.log('PASS filtros por texto, data e participante; reimportação não chama IA nem duplica');
    await pagina.evaluate(async () => {
      await chrome.storage.local.set({ 'taq:conversations': [{ id: 'conversa-teste', title: 'Nome anterior', createdAt: 1, updatedAt: 1,
        messages: [{ id: 'm1', role: 'user', text: 'Conversa sobre acessibilidade', at: 1 }] }] });
    });
    await pagina.getByRole('button', { name: 'Conversas', exact: true }).click();
    await pagina.getByLabel('Buscar conversas', { exact: true }).fill('acessibilidade');
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
    await pagina.getByLabel('Buscar documentos', { exact: true }).fill('revisao API');
    await pagina.locator('.tq-estante .tq-item-linha').first().waitFor();
    console.log('PASS busca no conteúdo de documentos gerados');
    for (const largura of [390, 320]) {
      await pagina.setViewportSize({ width: largura, height: 844 });
      await pagina.goto(`${base}?secao=reunioes`);
      await pagina.getByText('Importar reunião', { exact: true }).click();
      assert(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await pagina.screenshot({ path: path.join(perfil, `importacao-${largura}.png`), fullPage: true });
    }
    assert.deepEqual(erros, []);
    console.log('PASS responsividade 390/320 px, sem erros de página');
    console.log('Capturas:', perfil);
  } finally { await contexto.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
