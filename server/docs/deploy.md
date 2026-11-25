# Deploy do servidor

Runbook completo. Nenhuma chave aparece aqui: tudo é variável de ambiente, e o
mesmo procedimento serve para a sua chave hoje e para a da empresa depois —
troca-se o valor, não o código.

> **Produção atual: Railway** (de volta desde **23/11/2026**; entre 22/09 e
> 23/11/2026 foi a Vercel). O servidor roda em `<URL-DO-SERVIDOR-DE-PRODUCAO>`, o
> endereço que o `.env` da extensão aponta. **O redeploy é automático** a cada push
> na branch conectada no painel do Railway. Onde o texto abaixo descreve a Vercel,
> vale para quem voltar a ela.
>
> Pontos que valem no Railway hoje:
>
> - **`DATABASE_URL` tem que ser o endereço do _pooler_ da Supabase**, não o da
>   conexão direta.
> - O app roda como processo Node de vida longa (`next start`): o `maxDuration`
>   das rotas e a região de `server/vercel.json` não têm efeito (seções 5 e 8).
> - **`DOCCITI_DATA_POLICY` é obrigatória em produção** (seção 4). Sem ela, as
>   rotas de geração respondem 503. "Produção", para o código, é
>   `RAILWAY_ENVIRONMENT_NAME=production` (o Railway define sozinho no ambiente
>   chamado `production`) ou `VERCEL_ENV=production` (`emProducao`, em
>   `lib/ai/config.ts`). Um ambiente do Railway com outro nome não é produção e não
>   tem as travas.
>
> **ANTES de publicar este servidor: aplique `server/lib/conector/esquema.sql` no
> banco de produção** (commit `365ef8c`). O esquema ganhou a coluna
> `token_do_conector.expira_em` (prazo absoluto de 90 dias, `not null`, com
> padrão calculado no `alter`). O código novo lê essa coluna: **sem ela, o conector
> MCP e a página de tokens caem com erro de coluna inexistente**. Reaplicar o
> arquivo é seguro (tudo é `if not exists`), e os tokens que já existem ganham 90
> dias a partir do momento em que o esquema é aplicado, então nenhum conector é
> derrubado na hora. A ordem é: esquema, depois deploy.
>
> **Para publicar**: defina as variáveis da seção 2 no serviço do Railway, dê push
> na branch conectada (ou *Redeploy* no painel) e rode a prova de fumaça da seção 6.
>
> O app continua sendo um Next.js (App Router) comum, sem `output: 'export'` e
> sem nada que exija hospedagem especial — qualquer host Node/Next serve. O que
> muda entre hosts está na seção 8.

---

## Manter sem custos e trocar a chave depois

Não há busca na internet (saiu em 23/11/2026; `TAQ_BUSCA_NA_INTERNET` não é mais
lida e pode ser apagada do host). Não há consulta de teste ao modelo ao abrir
a extensão: `GET /api/taq/estado` apenas lê configuração, sem validar a chave no
provedor e sem gastar tokens. Uma chave presente pode estar expirada ou sem cota;
nesses casos, o erro só será conhecido ao fazer um pedido real.

Enquanto não houver chave compatível, a IA permanece pendente. Uma chave do plano
gratuito sujeita a treinamento deve continuar com `DOCCITI_DATA_POLICY=training`:
isso mantém a recusa de reuniões e documentos reais. Não altere para `private`
apenas para contornar essa recusa. Captura e dados locais não dependem da chave.

Quando houver uma chave funcional:

1. No projeto Vercel, em **Settings → Environment Variables**, altere
   `GOOGLE_API_KEY` no ambiente **Production**. Não altere o segredo compartilhado
   com a extensão nem o endereço do servidor para uma simples troca de chave.
2. Declare `DOCCITI_DATA_POLICY=private` somente se os termos da chave garantirem
   tratamento compatível, sem uso dos dados para treinamento. Ajuste
   `TAQ_ORQUESTRADOR`, `DOCCITI_LEITOR` e `DOCCITI_AUDITOR` se precisar trocar
   também os modelos, verificando disponibilidade e preços do provedor.
3. Publique o código preparado com `vercel deploy --prod` a partir do projeto
   ligado. Para futuras trocas apenas de variável, faça **Redeploy** do deploy que
   já contém este código. Redeploy de uma versão antiga não publica mudanças locais.
4. Volte à janela da extensão: ela consulta a disponibilidade ao ganhar foco e a
   cada minuto enquanto visível. A partir desta atualização da extensão, futuras
   trocas de chave não precisam de reinstalação ou rebuild. A primeira atualização
   do cliente ainda precisa ser carregada em `chrome://extensions`.

Uma chave paga **gera custo nas chamadas de IA** depois de instalada. Para manter
custo zero agora, não ative faturamento nem use uma chave paga. Os testes desta integração usam respostas simuladas.

## 1. Criar o projeto

O repositório tem **dois projetos independentes**: a extensão na raiz e este
servidor em `server/`. O host precisa saber disso.

| Campo | Valor |
| --- | --- |
| **Root Directory** | `server` |
| Framework | Next.js (detectado sozinho) |
| Build / Install | padrão |

**`Root Directory = server` é obrigatório.** Sem isso o host tenta construir a
extensão (Vite) achando que é o app Next, e o deploy falha ou publica a coisa
errada. É ajuste de projeto, no painel — não dá para configurar por arquivo.

No Railway (produção atual), o redeploy é automático a cada push na branch
conectada — ~1 minuto nas duas vezes medidas em 22/08/2026. Confira no painel
**qual repositório e qual branch** o serviço segue: um push em outro lugar não
publica nada. Na Vercel o deploy era manual. Em qualquer host,
`docs/publicar-release.md` manda publicar o servidor **antes** de cortar a tag.

---

## 2. Variáveis do SERVIDOR

No painel do host, nas variáveis de ambiente do serviço. Esta tabela não muda
de host para host.

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `DOCCITI_SHARED_KEY` | **sim** | Segredo compartilhado com a extensão. Sem ela toda requisição responde **500** — falha fechada de propósito, porque "sem segredo" não pode significar "aberto para todo mundo" com uma chave paga atrás. |
| `GOOGLE_API_KEY` | sim (na config atual) | Chave do provedor. Ver a seção 4 — **precisa ser paga**. |
| `ANTHROPIC_API_KEY` | não | Só se trocar o provedor em `lib/ai/config.ts`. |
| `XAI_API_KEY` | não | Idem. |
| `DOCCITI_MAX_TRANSCRIPT_CHARS` | não | Teto por requisição. Padrão 400000. |
| `DOCCITI_DATA_POLICY` | **sim, em produção** | `private` (chave paga, sem treinamento) ou `training` (chave que treina). Em produção (`RAILWAY_ENVIRONMENT_NAME=production` ou `VERCEL_ENV=production`), ausente → as rotas de geração respondem 503 e o Taq fica pendente (503). Com `training` → a geração é recusada (400) e o Taq também (403): em produção o `"sintetica": true` do cliente não vale. Fora de produção (inclusive *Preview*) é opcional. Ver a seção 4 (`lib/ai/config.ts`, `lib/taq/config.ts`). |
| `DOCCITI_LEITOR` / `DOCCITI_AUDITOR` (`DOCCITI_PENSANTE` ainda vale pelo Leitor) | não | `provedor:modelo`, para trocar de modelo sem recompilar. |
| `DATABASE_URL` | sim, para o conector/sincronização | Postgres do acervo sincronizado (`lib/conector/banco.ts`). Na Supabase, o endereço do _pooler_. |
| `GOOGLE_OAUTH_WEB_CLIENT_ID` | sim, para a identidade por Google | Cliente OAuth "Aplicativo da Web" que o servidor confere (campo `aud`) ao validar o token. Sem ela, a identidade recusa tudo — falha fechada (`lib/identidade/google.ts`). Ver `docs/google-oauth-setup.md`. |
| `TAQCITI_DOMINIO_PERMITIDO` | não | Domínio de e-mail aceito para entrar e para o token do conector. Padrão `citi.org.br`: deixá-la de fora **não** abre o produto. Aceita com ou sem `@`. `*` desliga a restrição — só para desenvolvimento (`lib/identidade/dominio.ts`). |
| `TAQCITI_EXIGIR_HD` | não | `sim` passa a exigir o domínio hospedado (`hd`) que o Google informa no token, recusando conta pessoal com e-mail do CITi. Ausente: aceita conta sem `hd` (`lib/identidade/dominio.ts`). |
| `DATABASE_CA` | recomendada | O certificado da CA do banco (PEM, com `\n` escapados se for uma linha). Com ela, a conexão valida o servidor; sem ela, TLS sem validação do certificado e um aviso no log a cada instância (`lib/conector/banco.ts`). |
| `DOCCITI_CHAVE_LEGADA` | não | Ponte do segredo antigo (`x-docciti-key`) para extensões que ainda não mandam o token do Google. Ausente ou diferente de `recusar`: a ponte fica aberta. `recusar` a desliga (`lib/guardaDeIa.ts`). |
| `TAQCITI_IA_CHAMADAS_DIA` / `TAQCITI_IA_CARACTERES_DIA` | não | Cota diária de IA **por pessoa** (chamadas a modelo e caracteres enviados), contada na tabela `uso_de_ia`. Padrões: 2.000 chamadas e 80 milhões de caracteres. Passou, 429 (`lib/guardaDeIa.ts`). |
| `DOCCITI_DIAGNOSTICO` | não | `ligado` reabre as rotas de diagnóstico (`/api/ai/bench`, `/smoke`, `/secao`), que em produção respondem 404. Só para uma verificação pontual; depois, remova (`lib/apiGuard.ts`). |
| `TAQCITI_COTA_MB` / `TAQCITI_LIMITE_BANCO_MB` | não | Cota por pessoa e limite do banco do acervo sincronizado (`lib/conector/`). |
| `GROQ_API_KEY` / `GROQ_TPM_LIMIT` | só com o provedor Groq | Chave e limite de tokens por minuto usados pela camada Groq. |
| `LLM_PROVIDER` | não | Provedor padrão da camada de IA (`lib/ai/config.ts`). |
| `DOCCITI_RATE_LIMIT_RETRIES` | não | Quantas esperas por 429 do provedor a camada tolera (`lib/ai/providers/shared.ts`). |
| `DOCCITI_TIMEZONE` | não | Fuso usado para a data da reunião (`lib/dataDaReuniao.ts`). |
| `TAQ_ORQUESTRADOR` | não | Modelo do Taq, `provedor:modelo`. Padrão `google:gemini-3.5-flash`; só `google` e `groq` têm adaptador com ferramentas, outro provedor deixa o Taq pendente (`lib/taq/config.ts`). |
| `TAQ_MAX_CONTEXTO_CHARS` | não | Teto do pedido do Taq, em caracteres. Padrão 300000 (`lib/taq/atender.ts`). |
| `OPENAI_API_KEY` | só com o provedor OpenAI | Chave do provedor (`lib/ai/providers/openai.ts`). |
| `DOCCITI_PROMPTS` | não | `anteriores` volta às versões de prompt anteriores sem deploy de código (`lib/prompts/index.ts`). |
| `DOCUMENTOS_RACIOCINIO_GERACAO` / `DOCUMENTOS_RACIOCINIO_EDICAO` | não | Esforço de raciocínio (`low`, `medium`, `high`) ao gerar e ao editar documento personalizado. Padrões `medium` e `low` (`lib/documentos/gerar.ts`). |
| `TAQCITI_TOKEN_INATIVO_DIAS` / `TAQCITI_MAX_ITENS_POR_TIPO` | não | Dias sem uso até um token do conector expirar (padrão 90, `lib/identidade/tokenDoConector.ts`) e teto de itens por tipo no acervo (padrão 5000, `lib/conector/projecoes.ts`). Além da inatividade, todo token tem **prazo absoluto de 90 dias** desde a criação (`DIAS_DE_VALIDADE`, coluna `expira_em`), e cada pessoa tem no máximo **3 tokens ativos** (`MAX_TOKENS_ATIVOS`; o quarto recebe 409). Nenhum dos dois vem de variável. |
| `DOCCITI_ORIGENS_PERMITIDAS` | **recomendada em produção** | Origens exatas que podem **ler** as respostas no navegador (CORS), separadas por vírgula. Em produção, só a origem da extensão publicada (`chrome-extension://<id>`); o valor real fica só no painel do host, nunca no repositório. Sem ela, qualquer origem `chrome-extension://<id>` é aceita (serve ao desenvolvimento e ao `dist-dev`, cujo id muda por máquina). Página web nunca é aceita (`lib/apiGuard.ts`). |
| `SMOKE_ID_TOKEN` | não (só para o script) | Usada só pelo `scripts/smokePdf.mjs`: um `id_token` do Google de uma conta do domínio, enviado como `Authorization: Bearer`. Sem ela, o script usa `x-docciti-key`. Ver a seção 6. |
| `MOCK_LLM` | **nunca em produção** | Força o provedor `mock` em todos os agentes; é a tranca dos testes (`vitest.setup.ts`). |

> A lista acima sai de uma busca por `process.env` no código do servidor; o
> valor padrão e o efeito exato de cada uma estão no arquivo citado.

Gere o `DOCCITI_SHARED_KEY` como um valor aleatório longo, e guarde: ele
precisa ser **idêntico** no servidor e na build da extensão (seção 3).

```bash
# um valor descartável e sem ambiguidade visual
openssl rand -hex 24
```

> Este segredo **não é autenticação**. Ele viaja dentro do bundle da extensão,
> que qualquer pessoa consegue abrir. Quem identifica a pessoa é o **token do
> Google** (`Authorization: Bearer <id_token>`): as rotas que gastam modelo
> (`/api/generate`, `/api/documentos/*`, `/api/taq/*`) passam por `autorizarIa`
> (`lib/guardaDeIa.ts`), que confere o domínio do CITi e conta a **cota diária por
> pessoa**. Sem o token, o segredo antigo ainda vale enquanto `DOCCITI_CHAVE_LEGADA`
> não for `recusar` — é só uma ponte para extensões antigas. A ordem para fechá-la:
> todos na extensão nova, depois `DOCCITI_CHAVE_LEGADA=recusar`, depois rotacionar
> `DOCCITI_SHARED_KEY` (rotacionar antes quebra quem não atualizou). Ver
> `lib/apiGuard.ts` e `docs/plano-de-seguranca.md`.
>
> **CORS** (`corsHeaders`, `lib/apiGuard.ts`; commit `365ef8c`): o servidor só deixa a
> **extensão** ler as respostas. Sem configuração, vale qualquer origem
> `chrome-extension://<id>`; com `DOCCITI_ORIGENS_PERMITIDAS`, só as listadas.
> Páginas web (inclusive a do Meet) não recebem `Access-Control-Allow-Origin`, então o
> navegador bloqueia a leitura, e como as rotas exigem header próprio, nem o POST sai
> depois do preflight. A origem recusada não vira 403: a rota responde normalmente,
> sem o cabeçalho. Requisição **sem** `Origin` (curl, scripts) não é afetada pelo CORS:
> quem a recusa é a autenticação (`autorizarIa`, `rejectIfUnauthorized`).

---

## 3. Variáveis da BUILD DA EXTENSÃO

O endereço do servidor e o segredo entram **no bundle, na hora da build** —
não são lidos em runtime. Sem eles, o padrão de desenvolvimento é
`http://localhost:3000`. Desde o commit `923ea5a`, `npm run build` (produção)
**recusa** URL que não seja `https://` e chave ausente ou de desenvolvimento
(`vite.config.ts`); para testar contra o servidor local use `npm run build:dev`.

Foi exatamente o que aconteceu com os instaladores da `v2.0.0`: saíram
apontando para localhost, e só funcionariam para quem estivesse rodando o
servidor na própria máquina.

No GitHub, em **Settings → Secrets and variables → Actions**:

| Nome | Onde | Valor |
| --- | --- | --- |
| `DOCCITI_SERVER_URL` | **Variables** | `<URL-DO-SERVIDOR-DE-PRODUCAO>` — sem barra no fim |
| `DOCCITI_SHARED_KEY` | **Secrets** | o mesmo valor da seção 2 |

A URL vai em *Variables* e não em *Secrets* porque ela não é segredo (está no
bundle de qualquer forma) e assim aparece legível nos logs, que ajuda a
diagnosticar.

O `release.yml` lê os dois e **falha a build se faltarem**, em vez de produzir
instaladores apontando para localhost em silêncio.

O procedimento completo da release — em que ordem fazer, como conferir o
instalador publicado e o que fazer quando o check aborta — está em
`docs/publicar-release.md`, na raiz do repositório.

---

## 4. A chave precisa ser PAGA. Isto não é preferência.

A configuração de free tier do Gemini manda todo o conteúdo enviado para
**treinamento do provedor, com revisão humana**. Transcrição de reunião é
exatamente o tipo de dado que os termos desaconselham mandar para lá.

A política de dados é **declarada** pela variável `DOCCITI_DATA_POLICY`, e em
produção ela é **obrigatória** (`lib/ai/config.ts`, `politicaDeDadosNaoDeclarada`):

- `private` — o servidor afirma que a chave é **paga**, sem treinamento. É o
  valor de produção.
- `training` — a chave é de free tier e **treina** com o conteúdo. Em produção,
  as rotas de geração **recusam** (400; o Taq, 403): o `"sintetica": true` do corpo só vale
  fora de produção (`aceitaSinteticaDoCliente`), e a extensão não o envia, porque
  captura reunião de verdade.
- ausente, em produção → 503 nas rotas de geração, e o Taq aparece como pendente.

"Em produção" quer dizer `RAILWAY_ENVIRONMENT_NAME=production` (o Railway define
no ambiente chamado `production`) ou `VERCEL_ENV=production` (a Vercel só define no
ambiente Production) — `emProducao`, em `lib/ai/config.ts`. Até 25/11/2026 só a
Vercel contava, e no Railway as travas ficavam desligadas em silêncio. Fora de
produção (desenvolvimento, *Preview*, outro ambiente) a variável é opcional. O aviso de treinamento também dispara
quando o modelo configurado é de uma entrada da matriz que treina
(`usesContentForTraining`), mesmo com `private` — então declarar `private` não
basta se o modelo escolhido for de treinamento.

Não há terceira opção com chave gratuita. **Use uma chave paga em produção e
declare `DOCCITI_DATA_POLICY=private`.**

Limite prático da chave gratuita, para referência: **20 requisições por dia,
por modelo**. Uma Ata completa consome quase tudo.

---

## 5. Tempo de execução

**O teto de função vale na Vercel.** As rotas de geração (`app/api/generate`,
`app/api/documentos/gerar`, `app/api/documentos/editar`, `app/api/ai/secao`,
`app/api/ai/bench`) declaram `export const maxDuration = 300`; `app/api/taq/turno`
declara 60. Na Vercel, cada uma é função serverless com esse teto por requisição.
Os comentários dessas rotas já dizem isso (`app/api/generate/route.ts:8-13`: "VALE EM
PRODUÇÃO"; o Railway só aparece como o período em que a diretiva ficava sem efeito).
O comentário de `app/api/generate/route.ts` diz que 300 s é o máximo do plano Hobby,
confirmado por deploy que falhou com 600 (17/08/2026) — não verificado de novo nesta
revisão.

Histórico: no Railway, o app rodava como processo Node de vida longa (`next
start`), e o `maxDuration` era inerte. Esse é o motivo de a versão anterior deste
documento tratar o teto como não existente.

**O que ainda NÃO foi medido:** uma geração completa de Ata na Vercel, com o
pipeline atual (Leitor + Auditor, duas chamadas, segundo o comentário de `lib/generateStep.ts`). A estimativa antiga, de ~360 s,
era do pipeline de nove seções e não vale mais. Antes de prometer prazo a alguém,
gere uma Ata de verdade e cronometre — é o único teste que exercita a coisa toda.

E o teto que **continua valendo em qualquer host** é o do próprio código:
transcrição acima de `DOCCITI_MAX_TRANSCRIPT_CHARS` (padrão 400.000
caracteres) leva **413** antes de virar uma conta cara.

Desde o `365ef8c`, as rotas `documentos/*` também medem o **corpo** antes do
`JSON.parse` e respondem **413** acima do teto (`lib/documentos/requisicao.ts`,
`tetoDoCorpo`). Com os padrões: `renderizar` 3,5 milhões de caracteres, `gerar`
1,3 milhão e `editar` 4,3 milhões, todos abaixo dos 4,5 MB que a Vercel aceita no
corpo de uma função (acima disso é ela quem recusa, antes do código). Um
`DOCCITI_MAX_TRANSCRIPT_CHARS` maior pode empurrar `gerar` e `editar` para além
desse limite. Depois do parse, um **orçamento de 250 mil nós** (`lib/listaComTeto.ts`,
`ORCAMENTO_DE_NOS`) recusa estruturas enormes antes de a validação gastar CPU e
memória, e toda lista do contrato recusa pelo tamanho antes de validar item por item
(`listaComTeto`). `/api/answers` tem o mesmo padrão (teto de 2 milhões de caracteres
no corpo, 413) e valida o `documentData` com `documentDataSchema`.

---

## 6. Conferir o deploy sem gastar cota

`scripts/smokePdf.mjs` chama `POST /api/answers`, que renderiza HTML e PDF
**sem chamar modelo nenhum** — roda de graça e não consome cota. Ele falha se
o PDF não vier, se não for um PDF de verdade, ou se a fonte Barlow não estiver
embutida.

```bash
cd server
SMOKE_BASE_URL=<URL-DO-SERVIDOR-DE-PRODUCAO> \
DOCCITI_SHARED_KEY=<a mesma chave> \
node scripts/smokePdf.mjs
```

Saída esperada:

```
PDF: 140092 bytes
Prova de fumaça OK: build de produção renderiza PDF com a Barlow embutida.
```

É a primeira coisa a rodar depois de qualquer deploy. Um `200` na home não
prova nada: o defeito que mais custou caro aqui era a rota respondendo **200
sem PDF**, em silêncio, só em build de produção.

Por padrão o script autentica com `x-docciti-key`, e `/api/answers` passa por
`autorizarIa`: funciona enquanto a ponte do segredo antigo estiver aberta. **Com
`DOCCITI_CHAVE_LEGADA=recusar`, o segredo sozinho toma 401 mesmo com o deploy
saudável.** Aí defina `SMOKE_ID_TOKEN` com um `id_token` do Google de uma conta do
domínio permitido: o script o envia como `Authorization: Bearer` (o valor não vai
para o log nem para o repositório). Sem nenhuma das duas credenciais, o script
avisa e sai.

Para provar o pipeline inteiro (aí sim consumindo cota), `POST /api/generate`
com um `transcript` e a mesma autenticação (`x-docciti-key` enquanto a ponte
existir, ou o token do Google).

Para conferir só que o deploy subiu — sem chave nenhuma — um `OPTIONS` basta,
e distingue "no ar" de "no ar com a versão nova":

```bash
curl -sI -X OPTIONS \
  -H 'Origin: https://meet.google.com' \
  -H 'Access-Control-Request-Method: POST' \
  <URL-DO-SERVIDOR-DE-PRODUCAO>/api/generate
```

---

## 7. Trocar para a chave da empresa

Nada de código muda.

1. Painel do host → variáveis de ambiente → editar `GOOGLE_API_KEY`.
2. **Redeploy** — variável de ambiente só vale a partir do próximo deploy. Na
   Vercel o deploy é manual: dispare um e confirme que terminou antes de testar,
   ou você mede contra o deploy antigo. (No Railway, salvar a variável já
   disparava um.)
3. Rodar a prova de fumaça da seção 6.

Se o `DOCCITI_SHARED_KEY` também mudar, é preciso **reconstruir a extensão**
(o valor está no bundle): atualizar o secret no GitHub e cortar uma tag nova.

---

## 8. Artefatos específicos da Vercel

Dois artefatos do repositório são da Vercel, e hoje valem na produção:

| Artefato | O que faz | Hoje |
| --- | --- | --- |
| `server/vercel.json` | fixa a região em `gru1` (São Paulo) | **vale** na Vercel (produção atual). Histórico (afirmação antiga do runbook, não verificada no código): no Railway, a região não era aplicada. |
| `maxDuration = 300` nas rotas de geração | teto da função serverless | **vale** na Vercel (ver seção 5). |

A seção 5 segue sendo o principal ponto de atenção: o teto de 300 s é o limite
da função, e o tempo de uma Ata completa na Vercel ainda não foi medido.
