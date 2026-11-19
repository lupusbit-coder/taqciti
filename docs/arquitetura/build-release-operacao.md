# Build, testes, CI, release e operação

Mapa de manutenção do que cerca o código: como compilar, testar, publicar e
operar o TaqCiti. Só consta aqui o que foi conferido nos arquivos do
repositório; o que não foi, está marcado como "não verificado". Valores de
variáveis, endereços de produção e identificadores de conta não aparecem
neste documento de propósito (o repositório é público).

## 1. Estrutura do repositório

| Onde | O que é |
| --- | --- |
| raiz | A **extensão** (Chrome/Edge, MV3): Vite + `@crxjs/vite-plugin`, React 18, Tailwind, Zod. `package.json` e `package-lock.json` próprios. |
| `server/` | O **servidor** Next.js (App Router): geração de documentos, camada de IA, conector/sincronização, Postgres. `package.json` e `package-lock.json` próprios. |
| `scripts/` | Utilitários da raiz: ícones, empacotamento do zip (`package-release.mjs`), `verify-*.cjs`, `lib/` (motor de ZIP e PNG sem dependência). |
| `.github/` | `workflows/ci.yml`, `workflows/release.yml` e `scripts/` (`check-release-env.sh`, `resolve-version.sh`). |

Não há mais `installer/`: os instaladores nativos (Inno Setup, pkgbuild, makeself), o
guia `COMECE_AQUI.html`, o pacote de distribuição e o envio ao Drive foram removidos em
13/11/2026, por decisão do usuário. Instalar é pedir a um assistente de IA ou seguir
`INSTALL.md`.
| `docs/` | Documentação; `docs/verification/` guarda saídas dos `verify-*.cjs` (capturas e JSON). |

São **dois projetos independentes**: um `npm ci` na raiz não instala nada do
servidor. O `server/next.config.ts` fixa `turbopack.root` justamente porque há
dois lockfiles (sem isso o Turbopack avisa "raiz ambígua" a cada build).
`server/.vercelignore` exclui `**/*.test.ts(x)`, `vitest.config.mts` e
`vitest.setup.ts` do upload: o type-check do build puxava testes que importam
de `src/`, fora do upload de `server/`.

## 2. Scripts npm

### Raiz (extensão, versão do pacote 2.1.2 no `package.json`)

| Script | Faz |
| --- | --- |
| `dev` | `vite` (servidor de desenvolvimento). Ver a ressalva da seção 3. |
| `build` | `vite build` (produção, saída em `dist/`). |
| `build:dev` | `vite build --mode development` (saída em `dist-dev/`, com o andaime de simulação). |
| `typecheck` | `tsc --noEmit`. |
| `test` / `test:watch` | `vitest run` / `vitest`. |
| `lint` | `eslint src` (só `src`). |
| `check:oauth` | `node scripts/check-oauth.mjs [development\|production]` (script novo, ainda não commitado): confere, sem imprimir valores, se os dois clientes OAuth da build (`VITE_*`) existem e batem com o `GOOGLE_OAUTH_WEB_CLIENT_ID` do servidor (`server/.env*`). |
| `format` | `prettier --write` em `src`, `docs/**/*.md` e arquivos de raiz. |
| `icons` | `node scripts/generate-icons.mjs`. |
| `package` | `node scripts/package-release.mjs`: roda `npm run build` e grava `release/taqciti-v<versão>.zip` (a extensão crua, montada com `scripts/lib/zip.mjs`). |

### `server/`

| Script | Faz |
| --- | --- |
| `dev` / `build` / `start` | `next dev` / `next build` / `next start`. |
| `typecheck` | `tsc --noEmit`. |
| `test` / `test:watch` | `vitest run` / `vitest`. |
| `test:live` | `node scripts/testLive.mjs`: roda `vitest run` com `DOCCITI_LIVE_TESTS=1` (portável entre shells, sem `cross-env`). |

Não há script de lint no servidor. Scripts avulsos: `server/scripts/smokePdf.mjs`
e `server/scripts/testLive.mjs`. Aviso do `server/AGENTS.md`: o Next usado
tem mudanças incompatíveis; a documentação correta está em
`server/node_modules/next/dist/docs/`.

## 3. Builds e pastas de saída

`vite.config.ts` decide a saída pelo modo: `production` vai para `dist/`,
qualquer outro (`development`) para `dist-dev/`. Pastas separadas para que
carregar a extensão de desenvolvimento não exija rebuildar a de produção.
`dist/`, `dist-dev/`, `release/` e `.env*` (exceto `.env.example`) estão no
`.gitignore`.

Pontos do `vite.config.ts` que importam na manutenção:

- Constante de build `__TAQCITI_DEV__` (`true` fora de produção): elimina o
  andaime de desenvolvimento do bundle de produção. Nos testes ela é `true`.
- Entradas extras do Rollup: `src/document/index.html` e `src/home/index.html`
  (páginas abertas por URL, sem chave de manifesto). O painel lateral é achado
  pelo `side_panel` do manifesto.
- Plugin `taqciti:panel-resources-only-on-meet` (antes `panel-resources-everywhere`;
  **mudança do commit `923ea5a`, 21/10/2026**): depois do @crxjs, fixa o
  `matches` das `web_accessible_resources` em `ONDE_O_PAINEL_VIVE`
  (`https://meet.google.com/*`). Era `<all_urls>`. É uma trava nos dois sentidos: nenhuma
  entrada gerada fica mais larga (qualquer site detectaria a extensão pelo ID fixo) nem
  mais estreita (o painel morreria no `import`, com o build passando e o `dist/`
  parecendo correto). Acompanha o `matches` do content script em
  `manifest.config.ts`, que passou a `https://meet.google.com/*`. Se o
  `manifest.json` não estiver no bundle, o plugin falha alto.
- Plugin `taqciti:servidor-de-producao-seguro` (commit `923ea5a`):
  uma build `production` é **recusada** se `VITE_DOCCITI_SERVER_URL` não for `https://`
  ou se `VITE_DOCCITI_SHARED_KEY` estiver ausente ou com o valor de desenvolvimento
  (`taqciti-dev-local`). Lê `loadEnv` do `.env` e `process.env` (este vence). O CI de
  release já recusava isso (`.github/scripts/check-release-env.sh`), mas a build local —
  a que vai por robocopy para o Chrome de quem desenvolve — caía em
  `http://localhost:3000` e na chave pública de dev, em silêncio: sem TLS, a transcrição
  e o token do Google viajariam em claro. Para testar contra o servidor local, use
  `npm run build:dev`.
  **CI:** o job `Extensão (raiz)` de `ci.yml` passa valores fictícios no `env` do passo
  de build (`VITE_DOCCITI_SERVER_URL: https://ci.invalid` e
  `VITE_DOCCITI_SHARED_KEY: ci-build-only`), porque ali só interessa que a build
  COMPILE. Sem eles a trava recusaria e o job ficaria vermelho. Quem acrescentar
  outro passo `npm run build` de produção no CI precisa repetir esse `env`.
- O manifesto vem de `manifest.config.ts` (versão, permissões, `client_id`).
  `manifest.config.ts` lê `VITE_*` do `.env` à mão com `loadEnv` (o Vite não
  povoa `process.env`); `process.env` tem precedência (caminho do CI).
  Sem `VITE_GOOGLE_OAUTH_CLIENT_ID` o manifesto sai com um placeholder válido:
  a extensão carrega, só o envio ao Google Docs e a seção Conexões ficam
  indisponíveis. Ver `docs/google-oauth-setup.md`.

### Variáveis lidas na build da extensão (só nomes)

| Nome | Função |
| --- | --- |
| `VITE_DOCCITI_SERVER_URL` | Endereço do servidor; padrão de desenvolvimento `http://localhost:3000`. Entra no bundle. |
| `VITE_DOCCITI_SHARED_KEY` | Segredo compartilhado enviado no header `x-docciti-key`; tem valor padrão público de dev (a build de produção recusa esse valor, ver acima). Entra no bundle: é tranca contra varredura, não autenticação. Desde o plano de segurança é só uma **ponte**: as rotas de IA preferem o `id_token` do Google (`fetchDeIa`). |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Cliente OAuth "Extensão do Chrome", lido por `manifest.config.ts`. |
| `VITE_GOOGLE_OAUTH_WEB_CLIENT_ID` | Cliente OAuth "Aplicativo da Web", lido em `src/shared/services/identidade.ts`; ausente = erro "não configurado na build". |

Observação verificada: o `release.yml` repassa à build **apenas** as duas
primeiras (`DOCCITI_SERVER_URL` e `DOCCITI_SHARED_KEY`). Os dois clientes OAuth
não entram pelo workflow; se a release deve trazê-los, isso não está
configurado lá (não verificado se é intencional).

## 4. Carregar a extensão no Chrome

1. `npm ci` e `npm run build` (produção, `dist/`) ou `npm run build:dev`
   (`dist-dev/`).
2. `chrome://extensions` (ou `edge://extensions`), ligar o "Modo do
   desenvolvedor", "Carregar sem compactação" e escolher a **pasta** (`dist` ou
   `dist-dev`), nunca o `.zip`.
3. Depois de cada rebuild, recarregar a extensão na página de extensões.

Armadilhas registradas em `vite.config.ts` e nos docs: o `npm run dev` (dev
server do @crxjs) não é o caminho usado de fato pelo time; não verificado aqui
se ele funciona hoje. Quem instala a partir do zip da release extrai numa pasta
fixa; mover ou apagar essa pasta quebra a extensão. O Chrome não deixa outro
processo (nem a automação de navegador) abrir `chrome://extensions`, por isso o
passo de "Carregar sem compactação" às vezes fica com a pessoa (ver `INSTALL.md`).

## 5. Estratégia de testes

### Extensão (`vitest.config.ts`)

- Ambiente `jsdom` (o parser de legendas do Meet só vale contra DOM de
  verdade), `include: src/**/*.test.{ts,tsx}`, sem plugin @crxjs, alias `@`
  para `src/`, `testTimeout` de 20 s (a HOME e a sidebar montadas em jsdom
  estouravam os 5 s padrão com CPU ocupada).
- `setupFiles: src/test/semRede.ts`: troca `globalThis.fetch` por uma rejeição
  imediata ("Failed to fetch"). Motivo: o `App` pergunta ao servidor se o
  assistente está disponível; sem isso a pergunta ia a `localhost:3000` e
  passava no Windows e falhava no Linux do CI (painel preso em "Verificando o
  assistente…"). Quem precisa de resposta faz `vi.stubGlobal('fetch', ...)`.
- **Exceção:** se `TAQ_LIVE_URL` está definida, o `fetch` real é mantido. É o
  que habilita os `*.live.test.ts`.
- Mocks de `chrome.*`: `src/test/chromeStorageMock.ts` (`installChromeStorageMock`,
  áreas de storage com `vi.fn` e eventos de mudança); os testes de recursos
  que usam outras APIs `chrome.*` montam stubs próprios (não inventariado aqui).

### Servidor (`server/vitest.config.mts`)

- Ambiente `node`, `include: lib/**/*.test.ts`, alias `@/` para `server/`
  declarado à mão (sem `vite-tsconfig-paths`).
- `vitest.setup.ts` define `MOCK_LLM=true` **antes** de qualquer import: é a
  "tranca" que faz todo agente resolver para o provedor `mock`, mesmo com chave
  de provedor presente no ambiente (a configuração é resolvida na importação,
  então definir dentro de `beforeEach` chegaria tarde). Não cobre quem monta um
  adaptador com transporte de rede de verdade; por isso `providers/openai.ts`
  recebe o `fetch` por parâmetro e o teste prova que o `fetch` global não é
  chamado.
- Banco: suítes usam **PGlite** (Postgres em WASM, devDependency). Cada suíte
  que o usa sobe um Postgres no `beforeAll`; em paralelo o boot passa dos 10 s
  só por disputa de CPU. Daí `hookTimeout` de 60 s e `testTimeout` de 30 s.
  Sobre consumo de memória das suítes de banco: o repositório não registra
  nenhuma configuração de limite de memória; não verificado.

### Testes ao vivo

Rodam contra servidor e provedor reais, ficam pulados por padrão e usam
reunião **inventada** (com chave de free tier o conteúdo vai a treinamento do
provedor: nunca gravação real).

| Arquivo | Habilita com | Exige |
| --- | --- | --- |
| `src/features/{taq/{taq,copiloto,trabalho},apoio,acompanhamento/juiz,estado,calibracao/historico}.live.test.ts` | `TAQ_LIVE_URL` + `TAQ_LIVE_KEY` | `cd server; npx next build; npx next start -p 3100` em outro terminal; `TAQ_LIVE_KEY` = o `DOCCITI_SHARED_KEY` do servidor. `trabalho` aceita `TAQ_LIVE_PAUSA_MS`. |
| `src/features/sync/sync.e2e.live.test.ts` | `TAQCITI_E2E_SERVER` (e `TAQCITI_E2E_COTA=1` para o servidor de cota) | Postgres local em contêiner, `server/lib/conector/esquema.sql` aplicado, `next start` com `DATABASE_URL` local, cliente OAuth de teste e um preload do Node (fora do repo) que responde ao `tokeninfo`; `TAQCITI_E2E_PG` nomeia o contêiner usado pelo `psql`; `VITE_DOCCITI_SERVER_URL` e `VITE_GOOGLE_OAUTH_WEB_CLIENT_ID` apontando para o ambiente de teste. **Nunca contra produção**: escreve e apaga acervo. |
| `server/lib/documentos/gerar.live.test.ts` | `DOCUMENTOS_LIVE=1` (e `DOCUMENTOS_AMOSTRAS=<pasta>`) | Suspende a tranca `MOCK_LLM` só nesse arquivo; lê `.env.local` do servidor sem imprimir. Gasta chamadas do provedor. |
| `server/lib/agents/auditor.canonical.test.ts` | `DOCCITI_LIVE_TESTS=1` + chave do Google | Via `npm run test:live` no servidor. |
| `server/lib/injecao.live.test.ts` | `INJECAO_LIVE=1` (`INJECAO_GERACOES`; `DOCCITI_PROMPTS=anteriores` compara versões) | Remove `MOCK_LLM` nesse arquivo; chave de provedor; gasta cota. |
| `server/lib/documentos/ataResumo.live.test.ts` | `ATA_LIVE=1` (gate conferido: `process.env.ATA_LIVE === '1'`; `DOCUMENTOS_AMOSTRAS` opcional, grava PDF e JSON) | Suspende a tranca `MOCK_LLM` e lê `.env.local` só nesse arquivo; chave de provedor; fixture sintética `docs/fixtures/reuniao-longa-ruidosa.txt`. Gasta cota. |

Observação: os `*.live.test.ts` da raiz fazem parte do `include`, então rodam
em `npm test`, mas ficam `describe.skip` sem as variáveis (padrão `rodar =
… ? describe : describe.skip`, conferido em vários deles).

### `scripts/verify-*.cjs` (Playwright)

Verificações **no navegador**, com a extensão carregada, para o que o jsdom não
cobre (layout, visibilidade, `chrome.storage` de verdade). O `playwright-core`
não é dependência do projeto: o caminho é passado como argumento ou por
`PLAYWRIGHT_CORE_PATH`; `BROWSER_PATH` troca o executável (o padrão dos
scripts é o Edge do Windows). Usam perfil temporário isolado, dados `[TESTE]`
e nenhuma chamada de IA. Saídas (capturas e JSON) vão para `docs/verification/<tema>/`.

| Script | Verifica | Pasta carregada |
| --- | --- | --- |
| `verify-ajuda.cjs` | rótulos da referência de ajuda (`src/features/taq/ajuda.ts`) contra a interface; grava `resultado.json` que o `ajuda.test.ts` usa | build de desenvolvimento |
| `verify-apagar.cjs` | botões de apagar da HOME (documento, conversa, notas) | `dist` |
| `verify-meetings-documents.cjs` | fluxo de reuniões e documentos | `dist` |
| `verify-preparar.cjs` | página "Preparar" (HOME larga e estreita), incluindo "Ajustes sugeridos", "Aplicar ao meu assistente" e "Agora não". "Reproduzir" só teve o rótulo, a habilitação e o aviso de privacidade conferidos (não é clicado: envia trechos ao provedor de IA) | build de desenvolvimento |
| `verify-trabalho.cjs` | cartões do Taq e página "Acompanhamento" | build de desenvolvimento |
| `verify-estados.cjs` | (commit `21550f4`) os estados que nenhum outro fotografa, a 1440 e a 390 px, sem IA, sem servidor e sem conta real: HOME vazia; Conexões com conta do CITi conectada, sessão vencida, sincronização ligada, gerar endereço do conector (Claude), erro ao gerar (ChatGPT) e endereços ativos com confirmação de revogar; cartões de ação externa na HOME e na sidebar; confirmações de apagar reunião, documento e conversa; criar documento carregando e com erro. Saída em `docs/verification/estados/` (`resultado.json`, `falhas` vazio = ok). **Não cobre** as transições que chamam o Google de verdade: a identidade é simulada só na página de teste (`chrome.identity.launchWebAuthFlow` trocada por uma função que devolve um `id_token` [TESTE], ou falha, para a sessão vencida), o service worker não usa essa simulação (a passada de sincronização dele falha por "sessão", e o script regrava um estado bom antes do print) e as rotas do servidor (`/api/conector/token`, `/api/generate`) são interceptadas. A conta de teste termina em `@citi.org.br` (o produto recusa outras). **A build precisa de `VITE_GOOGLE_OAUTH_WEB_CLIENT_ID` e `VITE_GOOGLE_OAUTH_CLIENT_ID`, com valores fictícios**: sem eles a tela mostra "login não configurado" e nenhum desses estados existe | build de desenvolvimento, com as duas variáveis fictícias |
| `verify-ao-vivo.cjs` | reunião ao vivo sintética no Meet simulado: captura de legendas, cartão de apoio e "O que falta fechar", com servidor e modelo de verdade (exige servidor local e chave; as falas são inventadas). **Nunca foi executado**: o resultado ao vivo continua não verificado. O trecho do consentimento foi reescrito em 11/11/2026 (shadow root `closed`): responde pela sidebar, e a presença da cápsula é conferida pelo host `taqciti-root` e por um print; esse trecho também não foi executado (exige chave de IA) | build de desenvolvimento |

Exemplo: `npx vite build --mode development --outDir <pasta>` e depois
`node scripts/verify-preparar.cjs <playwright-core> <pasta>`. O Chrome
recente pode ignorar `--load-extension`; os scripts usam o Edge por padrão.

## 6. CI (`.github/workflows/ci.yml`)

Dispara em push (qualquer branch), pull request e manualmente. Node 20.

| Job | Runner | Passos | Por que existe |
| --- | --- | --- | --- |
| `extensao` | ubuntu | `npm ci`, `typecheck`, `lint`, `test`, `build` | Antes, esses checks só rodavam na máquina de quem desenvolvia. |
| `servidor` (nome exibido "Servidor (server/)") | ubuntu, `working-directory: server` | `npm ci`, `typecheck`, `test`, `build` (com `DOCCITI_SHARED_KEY` descartável), `npm run start` + `wait-on` (versão fixa) + `node scripts/smokePdf.mjs` | O `build` não é redundante: o `pdfkit` lê arquivos do próprio pacote e, empacotado, quebrava só em produção (PDF ausente com resposta 200). Por isso `serverExternalPackages: ['pdfkit']` em `next.config.ts`. A prova de fumaça usa `POST /api/answers`, que renderiza HTML e PDF sem chamar modelo, e falha se não vier PDF válido com a Barlow embutida. |

Todas as actions estão fixadas por SHA e o workflow tem `permissions: contents: read`
(plano de segurança, fase 4). Nenhuma chave real deve ir ao CI. O CI não cobre `lint` do
servidor (não existe). O job `instalador-windows` saiu com os instaladores (13/11/2026).

## 7. Release

Gatilho: tag `v*.*.*` (três números; `v2.1` não dispara nada, em silêncio) ou
disparo manual de `release.yml`. Runbook completo: `docs/publicar-release.md`.

1. Subir a versão em `package.json` e `manifest.config.ts` (o workflow recusa
   uma tag que não bata com o `package.json`, que dá nome ao zip).
2. Publicar o servidor **antes** (deploy manual) e conferir com a prova de
   fumaça.
3. Garantir no GitHub: variável `DOCCITI_SERVER_URL` (Variables) e segredo
   `DOCCITI_SHARED_KEY` (Secrets). O repositório mudou para
   `lupusbit-coder/taqciti` em 13/11/2026 e esses valores não vieram do antigo.
4. Commit em `main`, tag, push da tag.

O `release.yml` tem um job só, `extensao` (ubuntu): `npm ci`,
`check-release-env.sh`, `resolve-version.sh` (argumento, tag ou `package.json`),
conferência tag × `package.json`, `npm run package` (build de produção e
`release/taqciti-v<versão>.zip`), `SHA256SUMS.txt`, artefato da run e — só em push
de tag `v*` — a GitHub Release com o zip e o hash. Disparo manual só compila.

`check-release-env.sh` recusa: variável ausente, URL com `localhost` ou
`127.0.0.1`, URL sem `https://` (conteúdo misto no Meet), URL terminando em
`/`. **Não toca a rede**: não prova que o servidor está no ar nem que a chave
confere (a v2.0.0 saiu verde apontando para `localhost`). O zip não é assinado.

Até 13/11/2026 a release compilava três instaladores nativos em três runners,
montava um `TaqCiti.zip` com guia e os subia ao Drive do time por uma Service
Account. Tudo isso saiu com a decisão de abandonar os instaladores.

## 8. Deploy do servidor

- Produção roda na **Vercel** desde 22/09/2026 (segundo `docs/publicar-release.md`
  e `server/docs/deploy.md`). O deploy é **manual**: nenhum push publica.
- Projeto no host com **Root Directory = `server`** (ajuste de painel, não de
  arquivo). `server/vercel.json` fixa a região `gru1`; `maxDuration` está
  declarado nas rotas de geração, e na Vercel vale como teto de função
  (`300` em `generate`, `ai/secao`, `ai/bench`, `documentos/gerar` e
  `documentos/editar`; `60` em `taq/turno` e em `importacao/transcrever`, esta nova e
  ainda não commitada).
- `server/docs/deploy.md` é o runbook da Vercel (o Railway, host anterior, aparece
  só como histórico). Os comentários das rotas de geração já dizem que a diretiva
  vale em produção (comentário de topo de `app/api/generate/route.ts`); o Railway só aparece como o
  período em que ela ficava sem efeito.
- `DATABASE_URL` tem que ser o endereço do **pooler** da Supabase, não a
  conexão direta (o erro de `lib/conector/banco.ts` quando a variável falta já
  aponta para as variáveis do projeto na Vercel). O pool é criado de forma preguiçosa, um por processo.
- A chave do provedor precisa ser **paga**: no free tier o conteúdo vai para
  treinamento. `DOCCITI_DATA_POLICY` é **obrigatória** em produção
  (`VERCEL_ENV=production`): `private` para a chave paga; ausente, 503 nas rotas
  de geração; `training`, 400 (o `sintetica: true` do cliente não vale em
  produção). Ver a seção 4 de `server/docs/deploy.md`.
- Depois de qualquer deploy: `node scripts/smokePdf.mjs` em `server/` com
  `SMOKE_BASE_URL` e `DOCCITI_SHARED_KEY`. Não gasta cota. Um 200 na home não
  prova nada. O script só manda `x-docciti-key`: depois de
  `DOCCITI_CHAVE_LEGADA=recusar` ele recebe 401.
- Variável de ambiente só vale a partir do próximo deploy. Trocar
  `DOCCITI_SHARED_KEY` exige reconstruir a extensão (o valor está no bundle).

### Variáveis do servidor (só nomes e funções)

| Nome | Função |
| --- | --- |
| `DOCCITI_SHARED_KEY` | Segredo do header `x-docciti-key`. Ausente = 500 (falha fechada). Desde o commit `09e99ab` é ponte para as extensões antigas. |
| `DOCCITI_CHAVE_LEGADA` | `recusar` desliga a ponte do segredo nas rotas de IA (só o `id_token` do Google vale). |
| `TAQCITI_IA_CHAMADAS_DIA`, `TAQCITI_IA_CARACTERES_DIA` | Tetos diários por pessoa das rotas de IA (padrão 2.000 chamadas e 80 milhões de caracteres). |
| `TAQCITI_TOKEN_INATIVO_DIAS` | Dias sem uso depois dos quais um token do conector deixa de valer (padrão 90). Cada uso renova o prazo; há também prazo absoluto de 90 dias desde a criação (`expira_em`) e no máximo 3 tokens ativos por pessoa (409 ao passar). |
| `DOCCITI_ORIGENS_PERMITIDAS` | Origens que podem ler as respostas do servidor (CORS), separadas por vírgula; em produção, só a da extensão publicada. Sem ela, qualquer `chrome-extension://<id>`. |
| `SMOKE_ID_TOKEN` | `id_token` do Google para o `smokePdf.mjs` (vai como `Authorization: Bearer`); necessário quando `DOCCITI_CHAVE_LEGADA=recusar`. |
| `DOCCITI_DIAGNOSTICO` | `ligado` reabre as rotas `/api/ai/{secao,smoke,bench}` em produção (404 sem ela); usar só pontualmente. |
| `DOCCITI_DATA_POLICY` | `private` (chave paga) ou `training`. **Desde o commit `bcb3355`:** em produção é OBRIGATÓRIA (sem ela as rotas de geração respondem 503 e o Taq fica `configuracao_pendente`), e o `sintetica: true` do cliente deixa de valer em produção. Ver `servidor-documentos.md`, seção 8. |
| `DATABASE_CA` | PEM da CA da Supabase; liga a validação do certificado TLS do banco (sem ela, aviso no log a cada instância). |
| `TAQCITI_EXIGIR_HD` | `sim` exige o claim `hd` no `id_token` do login. |
| `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY` | Chaves dos provedores de IA. |
| `LLM_PROVIDER`, `DOCCITI_LEITOR`, `DOCCITI_AUDITOR` (`DOCCITI_PENSANTE` vale pelo Leitor) | Escolha de provedor/modelo (`provedor:modelo`). |
| `MOCK_LLM` | Força o provedor mock; só para testes. |
| `DOCCITI_DATA_POLICY` | Política de dados (ver acima). |
| `DOCCITI_MAX_TRANSCRIPT_CHARS` | Teto da transcrição por requisição (413 acima). |
| `DOCCITI_RATE_LIMIT_RETRIES`, `GROQ_TPM_LIMIT` | Espera por 429 do provedor. |
| `DOCCITI_TIMEZONE` | Fuso da data da reunião. |
| `DATABASE_URL` | Postgres do acervo sincronizado. |
| `GOOGLE_OAUTH_WEB_CLIENT_ID`, `TAQCITI_DOMINIO_PERMITIDO` | Identidade por Google e domínio aceito. |
| `TAQCITI_COTA_MB`, `TAQCITI_LIMITE_BANCO_MB` | Cotas do acervo. |
| `DOCUMENTOS_LIVE`, `DOCUMENTOS_AMOSTRAS`, `DOCUMENTOS_RACIOCINIO_GERACAO`, `DOCUMENTOS_RACIOCINIO_EDICAO`, `DOCCITI_LIVE_TESTS` | Só testes. |
| `SMOKE_BASE_URL` | Alvo do `smokePdf.mjs`. |

Mais variáveis lidas pelo código do servidor (conferido por busca em `app/`, `lib/` e
`scripts/`, fora dos testes):

| Nome | Função |
| --- | --- |
| `TAQ_ORQUESTRADOR` | Modelo do Taq, `provedor:modelo` (padrão Google; só `google` e `groq` têm adaptador com ferramentas). |
| `TAQ_MAX_CONTEXTO_CHARS` | Teto de um turno do Taq (padrão 300.000; 413 acima). |
| `OPENAI_API_KEY` | Chave do provedor OpenAI (junto de `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY` e `GROQ_API_KEY`, acima). |
| `DOCCITI_MODELO_TRANSCRICAO` | Modelo de transcrição de áudio (ainda não commitada; usa `GROQ_API_KEY` e exige `DOCCITI_DATA_POLICY=private`). |
| `TAQCITI_MAX_ITENS_POR_TIPO` | Teto de itens por tipo no acervo (padrão 5.000). |
| `DOCCITI_ESCRITOR` | Aparece no código, mas não tem efeito (o agente foi cortado). |

`server/.env.example` comparado com a tabela (só nomes): traz `DOCCITI_SHARED_KEY`,
`DOCCITI_MODELO_TRANSCRICAO`, `DOCCITI_ORIGENS_PERMITIDAS`, `DOCCITI_MAX_TRANSCRIPT_CHARS`,
`DOCCITI_DATA_POLICY`, as chaves `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` e
`XAI_API_KEY`, `LLM_PROVIDER`, `MOCK_LLM`, `DOCCITI_PENSANTE`, `DOCCITI_AUDITOR`,
`DOCCITI_ESCRITOR`, `DATABASE_URL`, `GOOGLE_OAUTH_WEB_CLIENT_ID`,
`TAQCITI_DOMINIO_PERMITIDO`, `TAQ_ORQUESTRADOR` e `TAQ_MAX_CONTEXTO_CHARS`. Divergências:
(1) faltam nele `GROQ_API_KEY`, `GROQ_TPM_LIMIT`, `DOCCITI_LEITOR`, `DOCCITI_CHAVE_LEGADA`,
`DOCCITI_DIAGNOSTICO`, `DOCCITI_PROMPTS`, `DOCCITI_RATE_LIMIT_RETRIES`, `DOCCITI_TIMEZONE`,
`DOCUMENTOS_RACIOCINIO_GERACAO`/`_EDICAO`, `DATABASE_CA`, `TAQCITI_EXIGIR_HD`,
`TAQCITI_COTA_MB`, `TAQCITI_LIMITE_BANCO_MB`, `TAQCITI_IA_CHAMADAS_DIA`,
`TAQCITI_IA_CARACTERES_DIA`, `TAQCITI_TOKEN_INATIVO_DIAS` e `TAQCITI_MAX_ITENS_POR_TIPO`
(a tabela acima e `server/docs/deploy.md` são a lista completa); (2) ele cita
`DIAGNOSTICO_MAX_BUSCAS`, que nenhum código lê (`lib/diagnostico/` não existe), e aponta
para `docs/deploy-vercel.md`, que não existe (o runbook é `server/docs/deploy.md`); (3) o
comentário dele diz que o segredo protege só `/api/generate` e `/api/ai/smoke`, mas
`autorizarIa` cobre também `/api/documentos/*`, `/api/taq/*` e `/api/importacao/transcrever`.
Corrigir o `.env.example` fica para quem tocar nele (fora do escopo desta revisão).

## 9. Armadilhas conhecidas (registradas em comentários e docs)

- **Extensão quebrada por localhost** (v2.0.0): a URL e a chave entram no
  bundle na build; sem as variáveis o padrão é `localhost:3000`. Um zip
  errado não tem conserto, só outra release. Conferir procurando `localhost:3000`
  em `assets/*.js` da pasta extraída.
- **pdfkit em produção**: fora do bundle (`serverExternalPackages`); só a prova
  de fumaça contra `next start` pega.
- **PGlite nos testes do servidor**: boot lento em paralelo, daí os timeouts altos.
- **Prompts no servidor**: instruções de sistema são versionadas no servidor e
  a extensão pede pelo nome; versão nova (ex.: `estado-v1`, `copilot-v2`)
  exige **publicar o servidor antes da extensão**, senão "Versão de instruções
  desconhecida". Lista de pendentes em `docs/segundo-cerebro.md`.
- **Tag com dois números** não dispara a release.
- **Rotas de IA: identidade e cota, com ponte** (commit `09e99ab`): `autorizarIa`
  identifica quem chama pelo `id_token` do Google e conta o uso por pessoa por dia
  (`uso_de_ia`); o segredo compartilhado continua valendo só enquanto
  `DOCCITI_CHAVE_LEGADA` não for `recusar`. **Ordem de desligamento:** (1) todas as
  instalações na versão que manda o token; (2) `DOCCITI_CHAVE_LEGADA=recusar`; (3) só
  então rotacionar `DOCCITI_SHARED_KEY` (rotacionar antes quebra quem ainda não
  atualizou, porque a chave está compilada nas extensões já instaladas). Não há `middleware.ts`
  (conferido); a tranca é a chamada a `autorizarIa` em cada rota. As rotas de
  diagnóstico respondem 404 em produção.
- **Anthropic e xAI** nunca foram exercitados contra a API real, só contra os
  tipos dos SDKs (`server/docs/divida-verificacao-provedores.md`, estado de
  12/08/2026, conferido contra o código em 13/11/2026: a dívida segue aberta, os
  adaptadores `anthropic.ts` e `xai.ts` existem como descritos e Google e Groq são os que
  já rodaram de verdade. O arquivo ainda diz que o Auditor roda em Haiku 4.5, o que vale só
  numa configuração Anthropic; o padrão atual do Auditor é Google flash-lite).
- **PowerShell e git** (convenção local): mensagens de commit com aspas
  quebram no PowerShell 5.1; usar `git commit -F arquivo`.

## 10. Checklist antes de publicar

- [ ] `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` na raiz.
- [ ] Em `server/`: `npm run typecheck`, `npm test`, `npm run build`.
- [ ] Se mexeu em PDF ou no bundle do servidor: `next start` local e
      `node scripts/smokePdf.mjs`.
- [ ] Se criou versão de instruções (prompt): servidor publicado primeiro.
- [ ] Esquema do banco aplicado antes do servidor, e servidor antes da extensão
      (ordem registrada para a sincronização). O `esquema.sql` do commit `09e99ab`
      acrescenta a tabela `uso_de_ia` e liga RLS em todas as tabelas: aplicar antes do
      servidor novo (sem a tabela a cota falha aberta, mas não conta).
- [ ] `DATABASE_CA` definida no host de produção (senão o TLS do banco segue sem
      validar o certificado).
- [ ] `DOCCITI_DATA_POLICY` declarada no host de produção (`private` só se a chave for
      paga). Sem ela o servidor de produção recusa gerar (503).
- [ ] Nenhuma build de produção da extensão sem `VITE_DOCCITI_SERVER_URL` em `https://`
      e chave que não seja a de dev (a trava do `vite.config.ts` recusa; o CI já passa
      valores fictícios no `env`, e um novo passo de build precisa repeti-los).
- [ ] Servidor de produção no ar e a prova de fumaça passa contra ele.
- [ ] `DOCCITI_SHARED_KEY` idêntica no host e no Secret do GitHub;
      `DOCCITI_SERVER_URL` com `https://`, sem `/` final.
- [ ] Versão igual em `package.json` e `manifest.config.ts`; tag `vX.Y.Z`.
- [ ] Decidir se a release deve levar os clientes OAuth (ver seção 3).
- [ ] CI verde na tag.
- [ ] Baixar o `taqciti-vX.Y.Z.zip` da Release, conferir o hash com o
      `SHA256SUMS.txt`, extrair e procurar `localhost:3000` no bundle (não pode
      aparecer).
- [ ] Rodar uma reunião de verdade até gerar o documento.
- [ ] Antes de ampliar a distribuição: teto de gasto nas contas dos provedores
      e decisão sobre `bench`/`smoke` (pendências de `docs/publicar-release.md`).
- [ ] Nada sensível em arquivos versionados: chaves, tokens, URLs de produção,
      IDs de conta.
