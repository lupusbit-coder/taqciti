/**
 * Prova de fumaça do render CONTRA UMA BUILD DE PRODUÇÃO já rodando.
 *
 * Existe por causa de um defeito que passou por 300+ testes verdes: o
 * `pdfkit` lê arquivos de dentro do próprio pacote, e empacotado pelo
 * bundler esse caminho era reescrito e a leitura falhava. Só em produção —
 * `next dev` e o vitest carregam o pacote normalmente. E como
 * `generateDocument` isola a falha do PDF de propósito (o HTML continua
 * saindo), a rota respondia 200 SEM PDF e sem erro visível: o download vinha
 * sem o arquivo, em silêncio, exatamente no ambiente que importa.
 *
 * Nenhum teste unitário pega isso, porque nenhum passa pelo bundler. Este
 * script passa.
 *
 * Usa `POST /api/answers` de propósito, e não `/api/generate`: aquela rota
 * renderiza HTML e PDF sem chamar modelo nenhum, então roda no CI sem chave
 * de provedor e sem consumir cota. É também um caminho real do produto —
 * é o que acontece quando alguém responde uma lacuna.
 *
 * Uso: `node scripts/smokePdf.mjs` com o servidor já de pé em :3000.
 *
 * Credencial: por padrão, o segredo compartilhado (`DOCCITI_SHARED_KEY`, no
 * header `x-docciti-key`) — é o que o CI usa. Contra um servidor com
 * `DOCCITI_CHAVE_LEGADA=recusar`, o segredo sozinho toma 401 mesmo com o deploy
 * saudável; aí defina `SMOKE_ID_TOKEN` com um id_token do Google de uma conta
 * do domínio, e ele vai como `Authorization: Bearer`. (O valor nunca entra no
 * repositório nem no log.)
 */
// `localhost`, não `127.0.0.1`: o `next start` escuta em IPv6 (`::1`) em
// algumas máquinas, e ali o IP literal v4 dá ECONNREFUSED com o servidor no
// ar. `localhost` resolve para o que existir.
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const CHAVE = process.env.DOCCITI_SHARED_KEY;
const ID_TOKEN = process.env.SMOKE_ID_TOKEN?.trim();

if (!CHAVE && !ID_TOKEN) {
  console.error('Defina DOCCITI_SHARED_KEY (padrão) ou SMOKE_ID_TOKEN — sem nenhum, a rota recusaria com 401.');
  process.exit(1);
}

const credencial = ID_TOKEN ? { authorization: `Bearer ${ID_TOKEN}` } : { 'x-docciti-key': CHAVE };

/** Mínimo que exercita capa (título + subtítulo), lista e rodapé. */
const corpo = {
  documentType: 'ata',
  title: 'Ata de Reunião — prova de fumaça',
  documentData: {
    metadata: { date: '19/08/2026', projectName: 'Projeto de Fumaça' },
    generalTopic: { topic: 'Verificação do render', progress: 'Em andamento.' },
    participants: [{ name: 'Ana', role: 'Gerente', roleSource: 'meeting', quotes: [] }],
    topicsDiscussed: [{ title: 'Integração', summary: 'Acentuação: gestão, adoção.', quotes: [] }],
    conclusion: { text: 'O render respondeu.' },
  },
  gaps: [],
  answers: [],
};

const falhas = [];
const conferir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const resposta = await fetch(`${BASE}/api/answers`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...credencial },
  body: JSON.stringify(corpo),
});

if (!resposta.ok) {
  console.error(`HTTP ${resposta.status}: ${await resposta.text()}`);
  process.exit(1);
}

const json = await resposta.json();

conferir(typeof json.html === 'string' && json.html.length > 500, 'HTML veio vazio ou ausente.');
conferir(
  typeof json.pdf === 'string' && json.pdf.length > 0,
  'A rota respondeu 200 mas SEM PDF — é a assinatura exata do defeito de bundling.',
);

if (typeof json.pdf === 'string' && json.pdf.length > 0) {
  const bytes = Buffer.from(json.pdf, 'base64');
  const cru = bytes.toString('latin1');

  conferir(cru.startsWith('%PDF-'), 'O que voltou não é um PDF.');
  conferir(bytes.length > 20_000, `PDF pequeno demais (${bytes.length} bytes) — capa provavelmente faltando.`);
  conferir(cru.includes('/FontFile2'), 'A fonte não está EMBUTIDA: o PDF só PEDE a fonte.');
  conferir(/\/BaseFont\s*\/[A-Z]{6}\+Barlow/.test(cru), 'Barlow não aparece como fonte do documento.');
  conferir(!cru.includes('Helvetica'), 'Sobrou Helvetica — o registro da Barlow falhou em silêncio.');

  console.log(`PDF: ${bytes.length} bytes`);
}

if (falhas.length > 0) {
  console.error('\nProva de fumaça FALHOU:');
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('Prova de fumaça OK: build de produção renderiza PDF com a Barlow embutida.');
