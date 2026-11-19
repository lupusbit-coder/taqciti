# Publicar uma release que funciona

Runbook da release: do servidor no ar até o zip da extensão na GitHub Release.

> **Desde 13/11/2026 não há instaladores.** A release publicava três
> instaladores nativos (Windows, macOS, Linux) e um pacote com guia no Drive do
> time. O usuário os abandonou: hoje quem instala pede a um assistente de IA
> (Claude, ChatGPT) que carregue a extensão no navegador, ou segue o passo a
> passo manual de [`INSTALL.md`](../INSTALL.md). A release publica só o zip da
> extensão e o SHA-256 dele.

Este runbook existe porque as releases antigas erraram por motivos opostos, e
os dois erros são fáceis de repetir:

- **`v2.0.0` publicou pacotes quebrados.** Saíram apontando para
  `http://localhost:3000`. Instalavam, abriam, e não geravam nada — a menos
  que a pessoa estivesse rodando o servidor na própria máquina. O sintoma na
  mão de quem instalou foi só "não gera nada", sem erro que explicasse.
- **`v2.1.0` não publicou nada.** O check de configuração abortou a build
  porque as variáveis não estavam configuradas no repositório. Esse é o
  comportamento **certo**: falhar aqui custa uma release, publicar errado
  custa a confiança de quem instalou.

---

## O que decide se a extensão publicada funciona

Dois valores, e eles entram **no bundle da extensão na hora da build** — não
são lidos em runtime:

| Variável da build | Padrão sem configuração | Onde |
| --- | --- | --- |
| `VITE_DOCCITI_SERVER_URL` | `http://localhost:3000` | `src/shared/config/serverConfig.ts` (`SERVER_BASE_URL`) |
| `VITE_DOCCITI_SHARED_KEY` | `taqciti-dev-local` | `src/shared/config/serverConfig.ts` (`SERVER_SHARED_KEY`) |

Consequência que manda no resto deste documento: **um zip publicado com o
valor errado não tem conserto.** O endereço está compilado dentro do arquivo
que a pessoa já baixou. A única saída é cortar outra release e pedir para todo
mundo recarregar a extensão.

Por isso a build de produção é recusada pelo `vite.config.ts` sem `https://` e
sem chave de produção, e `.github/scripts/check-release-env.sh` diz qual valor
falta **antes** de compilar.

> **Repositório novo (13/11/2026).** O projeto mudou para
> `lupusbit-coder/taqciti`, e os secrets e variables do repositório antigo
> NÃO vieram junto. Até alguém cadastrar os dois valores abaixo no repositório
> novo, toda release falha no check — que é o comportamento certo.

---

## Antes de cortar a tag

### 1. Servidor no ar, e respondendo

O runbook do deploy é `server/docs/deploy.md`. O mínimo, em qualquer host:
**Root Directory = `server`**, `DOCCITI_SHARED_KEY`, `DOCCITI_DATA_POLICY` e a
chave do provedor nas variáveis de ambiente do serviço. O deploy é manual:
**publique o servidor antes** de cortar a tag. O endereço real de produção não
é registrado neste arquivo (público): leia o painel do host.

Confirme que responde, antes de gastar uma release — a prova de fumaça não
consome cota de modelo nenhum:

```bash
cd server
SMOKE_BASE_URL=<URL-DO-SERVIDOR-DE-PRODUCAO> \
DOCCITI_SHARED_KEY=<a mesma chave> \
node scripts/smokePdf.mjs
```

### 2. As duas variáveis no GitHub

**Settings → Secrets and variables → Actions**:

| Nome | Onde | Valor |
| --- | --- | --- |
| `DOCCITI_SERVER_URL` | **Variables** | `<URL-DO-SERVIDOR-DE-PRODUCAO>` — `https://`, sem barra no fim |
| `DOCCITI_SHARED_KEY` | **Secrets** | **idêntico** ao valor que está no host do servidor |

> **O check não testa o servidor.** Ele confere só que as duas existem, que a
> URL não é `localhost`/`127.0.0.1`, que começa com `https://` e que não
> termina em `/`. Nada disso toca a rede. Com o servidor fora do ar, ou com a
> chave diferente da que está no host, a release **passa verde e publica um
> zip quebrado** — o mesmo sintoma da `v2.0.0`. É por isso que o passo 1 vem
> antes do 2.

---

## Cortar a release

### 3. Subir a versão nos dois lugares

```
package.json        → "version": "X.Y.Z"
manifest.config.ts  → version: 'X.Y.Z'
```

O do `manifest.config.ts` é o que o Chrome mostra na extensão instalada. O do
`package.json` vai no nome do zip, e o workflow **recusa** uma tag que diga
outra versão — sem isso, `v2.2.0` publicaria um `taqciti-v2.1.2.zip`.

### 4. Commit e push

```bash
git add package.json manifest.config.ts
git commit -m "chore(release): versao X.Y.Z na extensao e no manifesto"
git push origin main
```

### 5. Tag com **três** números

```bash
git tag -a vX.Y.Z -m "TaqCiti X.Y.Z"
git push origin vX.Y.Z
```

O gatilho do workflow é `v*.*.*`. **`v2.1` não dispara nada** — nenhum erro,
nenhuma run, só silêncio. Tem que ser `v2.1.0`.

---

## O que o workflow faz

`.github/workflows/release.yml`, um job só (`extensao`), em ordem:

1. `npm ci` e **check-release-env**;
2. resolve a versão (`.github/scripts/resolve-version.sh`) e confere que ela é
   a do `package.json`;
3. `npm run package` — build de produção e `release/taqciti-v<versão>.zip`;
4. `SHA256SUMS.txt` do zip;
5. sobe zip e SHA-256 como artefato da run;
6. **só numa tag `v…`**: publica a GitHub Release com os dois arquivos e o
   changelog gerado.

**Compilar sem publicar:** *Actions → Release → Run workflow*. A run compila,
deixa o zip como artefato (`extensao`) e não publica nada — o passo da Release
só roda num push de tag.

Acompanhar:

```bash
gh run watch                          # a run mais recente
gh run view --log-failed              # só o passo que falhou
```

---

## Conferir antes de avisar o time

Release verde não prova extensão boa — a `v2.0.0` ficou verde.

1. **Baixe o zip da Release e confira o hash** com o `SHA256SUMS.txt`
   (`Get-FileHash` no Windows, `shasum -a 256` no Mac/Linux).
2. **Procure `localhost` no bundle.** Extraia o zip numa pasta e:

   ```powershell
   # Windows
   Select-String -Path "<pasta>\assets\*.js" -Pattern "localhost:3000"
   ```

   ```bash
   # Linux / macOS
   grep -r "localhost:3000" <pasta>/assets/
   ```

   Sem resultado = certo. Para confirmar o outro lado, procure o host de
   produção no mesmo lugar — ele **tem** que aparecer.
3. **Rode uma reunião de verdade** — carregue a pasta em `chrome://extensions`
   e gere um documento até o fim. É o único teste que exercita extensão,
   servidor e chave juntos.

---

## Quando falhar

| No log | Causa | O que fazer |
| --- | --- | --- |
| `FALTA VITE_DOCCITI_SERVER_URL` | a Variable `DOCCITI_SERVER_URL` não existe | criar em *Variables* (não em *Secrets*) |
| `FALTA VITE_DOCCITI_SHARED_KEY` | o Secret `DOCCITI_SHARED_KEY` não existe | criar em *Secrets* |
| `aponta para a maquina local` | a Variable foi preenchida com `localhost` | trocar pelo endereço de produção |
| `precisa comecar com https://` | endereço `http://` | a extensão roda em página https (Meet); `http://` seria bloqueado como conteúdo misto |
| `nao pode terminar com '/'` | barra no fim | duplicaria em `${url}/api/generate` |
| `não é a do package.json` | tag e `package.json` com versões diferentes | acertar o `package.json` (passo 3) e cortar a tag de novo |
| nenhuma run apareceu | tag fora do padrão `v*.*.*` | cortar `vX.Y.Z` com três números |

**Não precisa de tag nova para tentar de novo** quando o erro é de
configuração: depois de arrumar as variáveis, re-rode a mesma run — ela relê as
variáveis do repositório na hora que roda (`gh run rerun <id> --failed`).

---

## Pendências anteriores à distribuição

`VITE_DOCCITI_SHARED_KEY` entra no bundle e fica legível na pasta que o Chrome
carrega: é tranca contra varredura, não autenticação. Desde a fase 1 do plano de
segurança, as rotas que gastam modelo passam por `autorizarIa`
(`server/lib/guardaDeIa.ts`), que identifica pelo `id_token` do Google e conta a
cota por pessoa — ver a regra 10 do `CLAUDE.md`. Ainda assim, confira o teto de
gasto nas contas dos provedores antes de distribuir amplamente.
