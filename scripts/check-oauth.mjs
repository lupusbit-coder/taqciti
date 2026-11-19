/**
 * Confere os dois clientes antes de abrir o Google: uma build sem cliente e
 * um servidor com audience diferente falham em momentos distintos do login.
 * Só imprime estados, nunca valores do ambiente nem credenciais.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const modo = process.argv[2] || 'development';
if (!['development', 'production'].includes(modo)) {
  console.error('Uso: npm run check:oauth -- [development|production]');
  process.exit(1);
}

const extensao = loadEnv(modo, raiz, 'VITE_');
// O Next carrega .env.development.local apenas em desenvolvimento.
const servidor = loadEnv(modo, resolve(raiz, 'server'), 'GOOGLE_OAUTH_');
const web = extensao.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID?.trim();
const docs = extensao.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim();
const audience = servidor.GOOGLE_OAUTH_WEB_CLIENT_ID?.trim();
const valido = (valor) => Boolean(valor && /^\d+-[a-z\d-]+\.apps\.googleusercontent\.com$/i.test(valor));
let pendencias = 0;
function conferir(ok, mensagem) {
  console.log(`${ok ? 'OK' : 'PENDENTE'}: ${mensagem}`);
  if (!ok) pendencias++;
}

const fonte = readFileSync(resolve(raiz, 'manifest.config.ts'), 'utf8');
const chave = fonte.match(/key:\s*'([^']+)'/)?.[1];
if (!chave) throw new Error('Chave pública não encontrada em manifest.config.ts.');
const id = createHash('sha256').update(Buffer.from(chave, 'base64')).digest('hex')
  .slice(0, 32).replace(/[0-9a-f]/g, (digito) => String.fromCharCode(97 + parseInt(digito, 16)));

console.log(`OAuth local (${modo})`);
console.log(`ID da extensão: ${id}`);
console.log(`Redirect do cliente Web: https://${id}.chromiumapp.org/`);
conferir(valido(web), 'VITE_GOOGLE_OAUTH_WEB_CLIENT_ID na extensão');
conferir(valido(audience), 'GOOGLE_OAUTH_WEB_CLIENT_ID no servidor local');
conferir(valido(web) && web === audience, 'Cliente Web igual nos dois lados');
conferir(valido(docs), 'VITE_GOOGLE_OAUTH_CLIENT_ID para Docs e Workspace');
if (web && docs) conferir(web !== docs, 'Clientes Web e Extensão do Chrome distintos');

const pasta = modo === 'production' ? 'dist' : 'dist-dev';
const manifesto = resolve(raiz, pasta, 'manifest.json');
if (existsSync(manifesto)) {
  const build = JSON.parse(readFileSync(manifesto, 'utf8'));
  conferir(build.key === chave, `Chave pública preservada em ${pasta}`);
  conferir(valido(docs) && build.oauth2?.client_id === docs, `Cliente Docs da build ${pasta} corresponde ao ambiente`);
} else {
  conferir(false, `Build ${pasta} ainda não gerada`);
}
console.log('Esta checagem não consulta o Google nem o host: tipo do cliente, redirect registrado e login precisam de conferência no ambiente real.');
process.exitCode = pendencias ? 1 : 0;
