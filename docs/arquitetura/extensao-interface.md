# Interface da extensão — arquitetura

Escopo: o que o usuário vê no Chrome. Telas em `src/home/`, `src/sidepanel/`,
`src/document/`; componentes em `src/shared/ui/`; plataforma em
`src/shared/platform/`; estilo em `src/shared/config/`; documentos no cliente em
`src/features/documents/`; estado do agente em `src/features/agent/`. Tudo aqui
foi lido no código; o que não foi está marcado "não verificado".

## 1. Superfícies

| Superfície | Entrada | Como abre |
| --- | --- | --- |
| Sidebar | `src/sidepanel/index.html` -> `main.tsx` -> `App.tsx` | `side_panel.default_path` no manifesto; o clique no ícone abre via `setPanelBehavior({ openPanelOnActionClick: true })` (`background/sidePanel.ts`). Não há popup. |
| Home (página cheia) | `src/home/index.html` -> `main.tsx` -> `HomePage.tsx` | mensagem `ui/openHome` ao background (`homeTab.ts`), que reutiliza sempre a mesma aba. Também é o destino de reserva se o painel não abrir (`chrome.action.onClicked` em `background/index.ts`). |
| Página de documento | `src/document/index.html` | só redireciona (`window.location.replace`) para a Home com `?record=<id>` (mais `&foco=notas` se veio assim; sem id, `?secao=reunioes`). Existe para não quebrar endereços antigos. |
| Cápsula no Meet | `src/content/ui/` | fora do escopo deste arquivo (ver `extensao-captura.md`). |

Os três `main.tsx` seguem o mesmo molde: importam `global.css` e o CSS da
superfície, montam `<PlatformProvider platform={extensionPlatform}>` e a raiz.

## 2. Home

`HomePage.tsx` é a raiz. Seis seções, definidas em `SideNav.tsx` (`SECOES`) e no
tipo `Secao` de `rota.ts`, nesta ordem: Assistente, Preparar, Reuniões,
Documentos, Acompanhamento, Conexões.

- **Navegação**: não há rota. A seção é `useState`, semeada UMA vez por
  `lerPedidoDaHome(window.location.search)` (`rota.ts`, função pura). Parâmetros:
  `secao`, `record` (implica Reuniões), `documento` (implica Documentos). Trocar
  de seção não empilha histórico do navegador.
- **SideNav**: recolhida; abre ao encostar na faixa esquerda (34 px) ou pelo botão
  "Abrir navegação"; fecha com atraso (340 ms) decidido pela posição do ponteiro
  e por foco de teclado (`:focus-visible`). Fechada fica `inert`. Clicar só navega.
- **Saída protegida**: `navegar()` chama `prepararSaida()` (`shared/services/navigation`).
  Componentes com algo pendente registram `protegerEdicao(...)` (nota, geração de
  documento). Se não der para sair, aparece "Conclua a geração ou tente salvar...".
- **Estado levantado para a Home** porque atravessa seções: reunião aberta,
  documento aberto, rascunhos de conversa (um por conversa, chave `\0nova` para a
  conversa que ainda não existe), rascunho e gravador de nota (`criarGravadorDeNota`,
  fora do React para a última tecla não morrer com o componente), lista de
  documentos, estado do agente.
- **Cabeçalho**: marca, indicador da reunião ao vivo (clicar abre a reunião),
  botão de brasas do fundo, botão de pausar movimento, menu de conversas
  (`ConversasMenu.tsx`).
- **Seções** (arquivos): Assistente = `AssistantView.tsx` (+ `WaveField.tsx`, só
  montada nesta seção); Preparar = `Preparar.tsx` (o mapa de contextos do
  assistente, `OQueLevar.tsx`, com os ajustes sugeridos e o teste numa reunião passada); Reuniões = `Paginas.tsx` (lista com `BuscaDoAcervo`, `ImportarReuniao` e `Automacoes` no topo, transcrição, `NotasDaReuniao`,
  `PrintsDaReuniao`, `GerarDocumento`); Documentos = `Documentos.tsx` e
  `DocumentoPersonalizado.tsx`; Acompanhamento = `Acompanhamento.tsx` (abas
  Compromissos, Decisões, Achados; mesma fonte `taq:trabalho` dos cartões do Taq);
  Conexões = `Conexoes.tsx` + `ContaDoCiti.tsx` (sincronização, conector, conta do
  CITi).
- **Reset de botão com `:where`** (`src/home/home.css`, comentário "O reset do botão com especificidade ZERO na raiz", commit `f8c769e`): o reset
  da HOME é `:where(.tq-home) button` (especificidade zero na raiz). Com
  `.tq-home button` (0,1,1) ele vencia toda classe de botão (0,1,0): `.tq-acao` perdia a
  moldura e a cor, `.tq-acao-principal` o verde e `.tq-acao-perigo` o vermelho, e botões
  como "Reproduzir", "Pedir alteração", "Baixar PDF" e "Aplicar ao meu assistente" saíam
  como texto solto (varredura de 11/11/2026). Regra: o reset só vale onde nenhuma classe
  disse outra coisa; ao criar uma classe de botão, não é preciso vencer o reset. O inverso
  também vale: `.tq-home .tq-pilula` (0,2,0) é mais específica que `.tq-acao-principal` e
  apagava o verde, por isso o botão "Entrar" de "Sua conta" não leva `tq-pilula`
  (`Conexoes.tsx`, `SuaConta`).
- **Tile do conector em Conexões** (`Conexoes.tsx`, `PaginaConexoes`, commit `21550f4`): o
  tile de Claude ou ChatGPT some quando o assistente já tem endereço, **mas não enquanto
  mostra o endereço recém-gerado** (`temEndereco(...) || criadoPara === '...'`). O valor
  em claro só existe na resposta da criação; a lista recarregada já traz o novo token, e o
  tile ia embora levando o `EnderecoNovo` junto, então o endereço nunca chegava à tela. Na
  conta conectada, "Sair" e o ✓ ocupam uma coluna só da grade (`tq-acoes tq-hub-fim`).
  Coberto por `scripts/verify-estados.cjs` (`endereco_novo_na_tela`).
- **Animação**: `useAnimacao(pausadaPeloUsuario)` devolve `animando`, `movimentoReduzido`,
  `motivo` (`preferencia`, `aba-oculta`, `usuario`). Respeita `prefers-reduced-motion`
  e aba oculta. A onda tem três estados: `escrita`, `captando`, `repouso`.
  `Brasas` (fundo) e `PointerLayer` (cursor) são camadas sem captura de clique.
  A escolha de pausar/desligar não é persistida (volta ao padrão ao recarregar).

## 3. Sidebar

`sidepanel/App.tsx`. Dois modos (`Seletores.tsx`, tipo `Modo`): "Reunião"
(`transcricao`) e "Conversa" (`conversa`). As duas seções ficam montadas; a
inativa usa `visibility: hidden` + `inert` para não perder rascunho nem rolagem.

- Fora de reunião o modo "Reunião" é o histórico (`Reunioes.tsx`); durante a
  reunião, um ícone no topo alcança o histórico. Entrar em reunião vai para a
  transcrição; encerrar abre a reunião recém-salva; sair sem reunião volta à conversa.
- Reunião ao vivo: `Reuniao.tsx` (ações em `AcoesDaReuniao.tsx`, pergunta rápida
  em `Pergunta.tsx`, abas em `AbasDaReuniao.tsx`: Transcrição, Notas, Prints).
  Pergunta rápida grava numa conversa própria, com a reunião como contexto, e
  "Continuar na conversa" só abre essa conversa.
- Apoio à condução: `CartaoDeApoio.tsx`, `EstadoDosPontos.tsx`.
- Conversa: `Conversa.tsx`. `OndaDoPainel.tsx` é o fundo (para sozinho com
  movimento reduzido; a sidebar não tem brasas).
- "Abrir" reunião/documento na sidebar significa `platform.send({ type:
  'ui/openHome', recordId | documentId })`. Botão "Abrir HOME" fixo no topo.
- Estado da captura (consentimento, participação, reunião detectada) vem de
  `features/meeting/consent`; a decisão é chaveada pela participação, não pela sala.
- Painel de simulação (`@/dev/PainelDeSimulacao`) só entra se `__TAQCITI_DEV__`;
  em produção o chunk não é emitido.

## 4. Plataforma

`shared/platform/types.ts`: interface `Platform` com `kind` (`extension` |
`desktop`) e três operações: `send(command)`, `subscribeMeeting`,
`subscribeHistory`. Todo `subscribe` emite o valor atual assim que puder.
`context.tsx`: `PlatformProvider` e `usePlatform()` (lança erro sem provider).
`extension.ts`: `extensionPlatform`, único lugar do lado da UI que traduz isso
para `chrome.runtime`/`chrome.storage` (assina antes de pedir o estado inicial
para não perder broadcast). Só a implementação `extension` existe neste escopo;
nenhuma implementação `desktop` foi encontrada nos arquivos lidos.
Ressalva: várias telas ainda usam `chrome.*` diretamente (ex.: `chrome.tabs.create`
em `GerarDocumento.tsx`, storage via `shared/services/storage`), então a fronteira
cobre mensagens e estado da reunião, não tudo.

## 5. Componentes compartilhados (`shared/ui`)

- Marca: `MarcaDoTaq` (onda viva do agente; o `estado` é a `AtividadeDoAgente` de `features/agent/atividade.ts`, e `ouve` é uma propriedade para quando a pessoa digita), `MarcaDaEscuta` (glifo da transcrição),
  `SinalTaqciti` (SVG), `Wordmark`, `Wave` (legado, 3 barras), `Brasas`, `Sheen` (só a cápsula do Meet o usa), `TextoCinetico` (texto da transcrição ao vivo na sidebar, `Reuniao.tsx`), `BuscaDoAcervo` (busca local por texto e período em Reuniões, Documentos e no menu de conversas; não envia nada à IA).
- Conversa: `RespostaDoTaq` (fontes como botões, documentos criados, em aberto,
  limitações), `CartoesDoTaq` (cartões validados vindos de ferramentas),
  `CartaoDeTela` (captura sob pedido), `TrilhaDaConversa` (barra de rolagem que
  é mapa da conversa), `BotaoCopiar`, `Markdown` (React, nunca `innerHTML`).
  **Links do modelo (commit `923ea5a`, 21/10/2026):** `Markdown.tsx`
  passa todo link por `destinoSeguro`: só `http(s)`; o domínio aparece SEMPRE ao
  lado do texto do link (quem clica vê para onde vai); fora dos domínios de
  confiança (`google.com`, `citi.org.br`) a query e o fragmento caem; link que
  não é URL válida vira texto puro. Motivo: o texto do modelo pode ter sido
  conduzido por uma fala injetada na transcrição, e um link é o canal clássico
  de exfiltração (o conteúdo da conversa na query string).
- Utilitários: `Icon` (SVG por nome), `format.ts`, `estadoDaCaptura.ts` (traduz o
  estado da reunião UMA vez para cápsula, sidebar e Home), `useColegasDoCiti`.

## 6. Tema e estilo

- Só tema escuro (`color-scheme: dark` em `global.css`); não há tema claro.
- Tokens em `shared/config/tokens.css` (`--c-*` canais RGB para Tailwind,
  `--color-*` prontos), declarados em `:root, :host` para valer também em
  shadow root. Regra do arquivo: não declarar cor, raio, blur ou sombra em outro lugar.
- `glass.css` (receita de vidro), `scrollbar.css`. `global.css` importa tudo e o Tailwind.
- Tipografia: **DM Sans** variável (família `TaqCiti DM Sans`, `--font-texto`) para texto e
  títulos, em arquivos locais `shared/fonts/dm-sans/` declarados em `fontes.css` (sem CDN;
  origem e licença OFL em `origem.json` e `public/licenses/`). A marca (`Wordmark`) conserva
  a Barlow. `tipografia.css` traz o acabamento comum (herança de fonte em campos, placeholder,
  animação de chegada do texto). Na página do Meet a cápsula/sidebar carrega a fonte por
  `content/ui/fonte.ts` (FontFace a partir do woff2 embutido), porque o shadow root não
  enxerga o `@font-face` da página.
- Home e sidebar usam CSS escrito à mão (`home/home.css`, `sidepanel/sidepanel.css`,
  `shared/ui/*.css`), prefixo de classes `tq-`. O verde é acento restrito a poucos
  lugares (comentário de `home.css`); cinzas neutros no resto.
- Direção visual por tela (verificado no código em 13/11/2026): o vidro (`.glass`, de
  `glass.css`) só é usado na **cápsula** injetada no Meet (`content/ui/Capsula.tsx`); a Home
  é grafite neutro, sem `.glass` (`ReuniaoEDocumentos.test.tsx` fixa isso) e a sidebar
  usa o CSS próprio. O comentário de abertura de `tokens.css` ainda
  descreve o sistema inteiro como "Liquid Glass" e está desatualizado nisso (o de `global.css` já foi corrigido).

## 7. Fluxo de gerar documento

1. **Catálogo** (`features/documents/catalogo.ts`, dados puros): `ata` (Ata de
   Reunião), `x1` (Doc Conversa (X1)), `resumo` (Resumo completo), com estrutura de
   seções e campos que o Taq pergunta. Um teste do servidor confere que bate com os
   modelos de lá. O tipo `DocumentType` em `document/generateDocument.ts` ainda lista
   também `daily`, `planning`, `review`, que não estão no catálogo.
2. **Disparo**: na reunião (seção Reuniões), botão "Criar documento"
   (`home/GerarDocumento.tsx`). A caixa mostra os tipos do catálogo, um campo livre
   e "Gerar com o padrão CITi". O texto livre também pode seguir para a conversa
   (`onPedirLivre` -> `pedirDocumento` em `HomePage.tsx`, que abre conversa nova com a
   reunião como contexto). O Taq também cria documentos por ferramenta (`features/taq`,
   fora do escopo).
3. **Geração por tipo**: `requestGeneration` faz POST em `/api/generate` do
   servidor (`SERVER_BASE_URL`); volta `content` (markdown), `html`, `pdf` (base64),
   `documentData`, `questions`, `gaps`. As chamadas às rotas de IA (geração, personalizado
   e o turno do Taq) passam por `fetchDeIa` (`shared/services/identidade.ts`, commit `923ea5a`): manda o segredo compartilhado SEMPRE e o
   `Authorization: Bearer <id_token do Google>` quando a pessoa ligou a conexão com o
   Google (`identidadeParaIa`, que nunca abre popup). Se o servidor recusar o token
   (401), descarta o cache e repete UMA vez só com o segredo, para um token vencido não
   derrubar a geração enquanto a ponte do segredo estiver de pé. O servidor conta a cota
   diária por pessoa (ver `servidor-documentos.md`).
4. **Salvar antes de dizer "Salvo"**: `guardarDocumento` (`features/documents/store.ts`,
   `taq:documents`). Se falhar, o resultado fica na tela com "Tentar salvar de novo",
   "Baixar" e "Descartar resultado". As perguntas da geração viram uma conversa nova
   com o Taq ("Pendências de ..."). **Esse fluxo ficou praticamente ocioso:** o servidor
   só devolve pergunta para uma lacuna marcada `extrema` (nenhuma detecção automática a
   marca hoje) e o documento NÃO sai mais com marcações "A preencher" — campo ausente
   simplesmente não entra. O código do cliente continua pronto para receber perguntas.
5. **Personalizado**: "Gerar com o padrão CITi" chama `gerarPersonalizado`
   (`personalizado/cliente.ts`, `/api/documentos/<rota>`), usando só a reunião aberta
   como fonte. Guardado por `guardarGeracao` com `tipo: 'personalizado'`; o histórico
   de versões fica em `taq:documentVersions` (`versoes.ts`, máx. `MAX_VERSOES` = 30,
   escrita com revisão esperada; conflito é recusado, não sobrescrito).
6. **Seção Documentos** (`Documentos.tsx`): lista, editor de texto (autosave via
   `criarGravadorDeDocumento`, espera 700 ms; "Salvar", "Baixar .md"/"Baixar .txt",
   "Apagar documento"; "Baixar rascunho" só se o salvamento falha). Documento
   `personalizado` abre `DocumentoPersonalizado.tsx`: prévia do PDF renderizado pelo
   servidor, escopo de alteração (documento todo, capa, seção), "Pedir alteração",
   lista "Versões" com "Ver"/"Restaurar" (restaurar cria versão nova), "Baixar PDF",
   "Baixar Word" (docx gerado agora pelo servidor; edições no Word não voltam).
7. **Exportar** (`document/baixarDocumento.ts`): Blob + `<a download>`, sem
   `chrome.downloads`. `baixarComoPdf`, `baixarComoHtml` (fallback), `baixarComoTexto`,
   `baixarComoDocx`. Google Docs: `document/googleDocs.ts` (`criarGoogleDoc`, só se
   `oauthConfigurado()`), botão "Enviar ao Google Docs" aparece só no quadro de
   resultado logo após gerar; `via: 'falhou'` não mostra aviso.
8. `document/answers.ts`: tipos de pergunta/lacuna da geração.

## 8. Conversa com o Taq na interface

- Armazenamento: `home/conversations.ts` (`taq:conversations`). Só grava mensagens
  escritas pela pessoa e respostas que o Taq de fato produziu (concluídas ou
  parciais); falha/cancelamento não gravam resposta. Mensagem pode levar
  `contexto` (trecho, transcrição, notas, prints) apenas por gesto explícito.
  Resposta carrega fontes conferidas, documentos criados, `pergunta` com opções,
  `copiavel`, `operacoes`.
- `useConversaAberta`: sem escolha abre a mais recente; se a aberta é apagada,
  vai para conversa nova (nunca mostra outra em silêncio). Mesma regra na Home e na sidebar.
- Envio: `acrescentarMensagem` grava primeiro; se `taq.fase === 'pronto'`
  (`useDisponibilidadeDoTaq`), `perguntarAoTaq` roda sem prender o campo. Sem Taq a
  tela diz o motivo antes da escrita. `cancelarTaq`, `confirmarAcaoDoTaq`,
  `desfazerExclusao` vêm de `features/taq/interface`.
- Atividade do agente: `features/agent/atividade.ts`, store com estados `repouso`,
  `preparando`, `escrevendo`, `concluido`, `falhou`, `cancelado`, `interrompido`,
  mais `parcial` (texto em chegada, não gravado) e `etapa`. `observarAgente`
  alimenta a onda, os seletores e o turno. `features/agent/escuta.ts` anuncia escrita.
- Rolagem: quem rola é a página; mensagem nova só puxa a rolagem se a pessoa já
  está no fim (margem 96 px) ou acabou de enviar.

## 9. Importar reunião e Automações (topo da seção Reuniões)

Dois blocos novos de `Paginas.tsx` (`PaginaReunioes`), ainda sem commit na hora desta revisão, mas em uso real: o background já trata `ui/history/import` e enfileira as automações (ver `extensao-captura.md`, seção 4.4).

- **`ImportarReuniao.tsx`**: a pessoa escolhe um arquivo, informa nome e data/hora e clica em "Importar". TXT, SRT e VTT (até 1 MB) são lidos localmente por `lerTranscricao`; áudio e vídeo (até 4 MB) são enviados SÓ no clique, por `fetchDeIa`, a `/api/importacao/transcrever` (servidor com chave Groq e `DOCCITI_DATA_POLICY=private`; sem isso responde 503 e a tela mostra o erro). O resultado vai ao background por `ui/history/import` e a tela abre a reunião. Reimportar o mesmo arquivo (mesmo hash) abre o registro que já existe. O áudio não identifica falantes. Está na ajuda do Taq (`features/taq/ajuda.ts`, tópico `importar_reuniao`).
- **`Automacoes.tsx`**: duas chaves, "resumo" e "compromissos" (próximos passos), desligadas por padrão, e a lista da fila de execuções (`pendente`, `executando`, `concluida`, `falhou`, `cancelada`) com "tentar novamente" para as que falharam. Lê e grava por `features/automacoes/automacoes.ts`. O resumo vira documento comum na seção Documentos (tipo `resumo`, origem `gerado`); os próximos passos entram como compromissos candidatos no Acompanhamento, respeitando o teto de 3 por reunião.

## 10. Persistência da UI

Tudo em `chrome.storage.local` por `shared/services/storage` (`readLocal`,
`writeLocal`, `onLocalChange`), chaves em `STORAGE_KEYS` (`shared/config/constants.ts`):
`taq:history`, `taq:conversations`, `taq:notes`, `taq:marks`, `taq:shots`,
`taq:documents`, `taq:documentVersions`, `taq:trabalho`, `taq:conducao`, `taq:apoio`,
`taq:integracoes`, entre outras. Exceção: as automações guardam preferências e fila em `taqciti:automacoes:v1` e `taqciti:automacoes:fila:v1`, fora de `STORAGE_KEYS`. Telas assinam com `observar*`/`onLocalChange` para
sincronizar abas. Escritas concorrentes usam `comTravaLocal`/`criarFilaDeGravacao`.
Rascunhos de conversa, aba aberta e animação pausada são estado de React, perdidos
ao recarregar. O histórico de reuniões é escrito pelo background/content, não pela UI.

## 11. Convenções

- Nomes de domínio e UI em português (`GerarDocumento`, `observarNotas`,
  `guardarDocumento`); tipos de protocolo em inglês (`MeetingRecord`, `UiCommand`).
- Comentário de topo explica a decisão (o porquê); leia antes de mudar.
- Estados vazios e falhas são ditos na tela; nada é inventado para parecer completo.
- Rótulos de botão são contrato: `features/taq/ajuda.ts` cita rótulos literais e
  `ajuda.test.ts` quebra se um deles sumir do arquivo de implementação. Renomear
  botão exige atualizar a ajuda.
- CSS: prefixo `tq-`, cores só de tokens, sem `position: fixed/sticky` no fluxo da
  conversa. Alias `@` = `src`.

## 12. Testes

`npm test` (`vitest run`); `npm run typecheck`; `npm run lint`. `vitest.config.ts`:
ambiente jsdom, `include: src/**/*.test.{ts,tsx}`, `define __TAQCITI_DEV__: true`,
`setupFiles: src/test/semRede.ts`, `testTimeout` 20 s (testes que montam Home ou
sidebar inteiras são lentos). Rodar um arquivo: `npx vitest run src/home/HomePage.test.tsx`.

Relevantes: `home/HomePage.test.tsx`, `rota.test.ts`, `GerarDocumento.test.tsx`,
`GerarDocumentoPersonalizado.test.tsx`, `DocumentoPersonalizado.test.tsx`,
`ReuniaoEDocumentos.test.tsx`, `Preparar.test.tsx`, `AssistenteTaq.test.tsx`,
`conversations.test.ts`, `apagarConversas.test.ts`, `ContaDoCiti.test.tsx`, `Espectro.test.tsx`,
`PointerLayer.test.tsx`, `Conexoes.test.tsx`, `OQueLevar.test.tsx`, `home.css.test.ts`; sidebar: `Sidebar.test.tsx`,
`Conversa.test.tsx`, `CartaoDeApoio.test.tsx`, `EstadoDosPontos.test.tsx`,
`sidepanel.css.test.ts`; shared: `CartoesDoTaq.test.tsx`, `Markdown.test.tsx`, `BuscaDoAcervo.test.ts`,
`estadoDaCaptura.test.ts`, `platform/extension.test.ts`; documentos:
`features/documents/store.test.ts`, `personalizado/*.test.ts`,
`document/baixarDocumento.test.ts`, `googleDocs.test.ts`; agente:
`features/agent/atividade.test.ts`; ajuda: `features/taq/ajuda.test.ts`.

Verificação na tela (não faz parte do `npm test`): `scripts/verify-ajuda.cjs`,
`verify-meetings-documents.cjs`, `verify-preparar.cjs`, `verify-trabalho.cjs`,
`verify-apagar.cjs`, `verify-estados.cjs` (Conexões em vários estados, cartões de ação
externa, confirmações, carregando e erro; a 1440 e 390 px; sem IA nem servidor) e
`verify-ao-vivo.cjs` (reunião ao vivo sintética; nunca executado),
que usam Playwright fora das dependências do projeto. Detalhes de cada um em
`docs/arquitetura/build-release-operacao.md`.
