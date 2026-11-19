# Roteiro: validar a experiência de reunião num Meet de verdade

O que está automatizado é **teste de integração com eventos simulados**: o
script dirige a página do painel e manda ao background as mesmas mensagens que
o content script mandaria (`valida-sidebar.mjs`, fora do repo, no diretório
temporário da sessão). Isso cobre o background, o storage e a sidebar de ponta
a ponta — e **não** cobre nada que dependa do DOM do Google Meet ou de uma
sessão autenticada.

Este roteiro é a outra metade. Nenhum item aqui pode ser dado como aprovado sem
alguém executá-lo.

**Antes de começar:** `npm run build:dev` (o `npm run build` de produção exige a URL
`https://` e a chave do servidor; ver `CLAUDE.md`), e em `chrome://extensions` carregar
`dist-dev/` sem empacotar (ou recarregar, se já estiver carregada). Confira que o
ícone do TaqCiti está fixado na barra.

---

## 1. Entrada e detecção com a sidebar FECHADA

| Passo | Resultado esperado |
| --- | --- |
| Feche o painel lateral. Entre numa reunião do Meet. | A cápsula aparece na página com o rótulo `registrar?` e um ponto âmbar pulsando. |
| Olhe a página, sem abrir nada. | Ao lado da cápsula: **"Deseja registrar esta reunião?"**, o nome da sala, a frase de que o TaqCiti lê as legendas e não grava áudio nem vídeo, e os botões **Registrar** / **Agora não**. Se a sala já tem uma gravação, aparecem também **Continuar de onde parou** e **Nova gravação** (no lugar de **Registrar**). |
| Confira a transcrição. | Nada foi capturado ainda. Em `chrome://extensions` → service worker → console, nenhuma `meet/detected` foi enviada. |

> Se a pergunta não aparecer, o provider não detectou a sala. O sinal é a
> cápsula ficar em `TaqCiti` em vez de `registrar?`.

## 2. Recusa mantém a captura desligada

| Passo | Resultado esperado |
| --- | --- |
| Clique em **Agora não**. | A pergunta some. A cápsula passa a `sem registro`. |
| Fale alguma coisa na reunião por ~30s. | Nenhuma fala é capturada. |
| Abra a sidebar (ícone da extensão **ou** clique na cápsula). | A lista de **Reuniões** mostra "Captura desligada nesta reunião. As anteriores continuam aqui." e o botão **Registrar esta reunião**. Nenhuma pergunta duplicada. A cápsula também ganha o botão discreto **Registrar esta reunião**. |

## 3. A cápsula abre o painel

| Passo | Resultado esperado |
| --- | --- |
| Com o painel fechado, clique na cápsula. | O painel lateral abre. |
| Arraste a cápsula para outro canto e solte. | Ela se move e **não** abre o painel (arraste ≠ clique). |

> Medido no Chrome 144: o clique na página abre o painel. Se aqui aparecer a
> mensagem "Não consegui abrir o painel daqui", algo voltou a pôr um `await`
> antes do `sidePanel.open()` — ver `src/background/sidePanel.ts`.

## 4. Aceitação inicia a captura

| Passo | Resultado esperado |
| --- | --- |
| Na sidebar (ou na cápsula), clique em **Registrar esta reunião**. | A cápsula vai para `preparando…` e depois para `Transcrevendo` com o cronômetro. A aba **Reunião** mostra **Transcrevendo** e o relógio. |
| Fale, e peça para outra pessoa falar. | As falas aparecem na aba **Reunião**, com nome e horário. As legendas nativas do Meet ficam escondidas. |

## 5. Pausa e retomada

| Passo | Resultado esperado |
| --- | --- |
| **Pausar** (fileira de ações da reunião), e fale por ~20s. | O selo vira **Pausada** e aparece "Captura pausada.". O que já tinha sido transcrito continua na tela. |
| **Retomar**, e fale de novo. | O botão volta a **Pausar** e o selo a **Transcrevendo**. As falas novas entram. **Nada do período pausado aparece.** |

## 6. Aviso no chat — janela de um minuto

| Passo | Resultado esperado |
| --- | --- |
| Dentro do primeiro minuto **depois de a captura começar**, veja a aba Reunião. | Cartão "Avisar no chat da reunião…", com o texto exato que será enviado e um contador em segundos. |
| Clique em **Enviar ao chat**. | O chat do Meet abre e a mensagem é enviada. O cartão vira "Avisado no chat da reunião." |
| Recarregue a aba do Meet e reabra a sidebar. | O cartão continua dizendo "Avisado" — **não** volta a oferecer o envio. |
| (Noutra reunião) Deixe o minuto passar sem clicar. | O cartão encolhe e some suavemente. A transcrição **não** salta. |
| (Noutra reunião) Deixe o minuto passar, recarregue a página. | O cartão **não** reaparece. |

> Este é o item mais frágil do conjunto: escrever no chat depende de seletores
> do DOM do Meet. Se falhar, a mensagem é "Não consegui escrever no chat do
> Meet" + **Copiar o texto** — e nada é marcado como enviado. Um "Avisado" sem
> a mensagem ter aparecido no chat é um defeito grave; registre.

## 7. Notas separadas da transcrição

| Passo | Resultado esperado |
| --- | --- |
| Dentro de **Reunião**, abra a aba **Notas** (as abas são Transcrição, Notas e Prints) e escreva duas linhas. | Depois de ~1s aparece `salvo`. |
| Vá para **Conversa** e volte para **Notas**. | O texto continua lá. |
| Volte para a aba da transcrição. | A aba Notas mostra o ponto de "já tem nota". A transcrição **não** contém uma palavra da nota. |
| Feche o painel, reabra. | A nota continua. |

## 8. Marcação preservada quando o trecho é atualizado

| Passo | Resultado esperado |
| --- | --- |
| Clique numa fala **que ainda esteja sendo dita**. | Realce discreto e a fileira de ações: marcas **Destaque** (★), **Dúvida** (?) e **Decisão** (✓), **Perguntar sobre o trecho** e **Copiar o trecho**. |
| Marque com **Decisão** (✓). | O ícone aparece à direita do nome de quem falou. |
| Espere a mesma fala ser completada pelo Meet. | O texto cresce; **a marca continua na mesma fala**. |
| Clique no ✓ de novo. | A marca sai. |
| Baixe o `.txt` depois. | O arquivo **não** tem ícone nenhum. |

## 9. Print da aba certa

| Passo | Resultado esperado |
| --- | --- |
| Com a aba do Meet à vista, clique em **Print** (fileira de ações). | O print é guardado na hora, com o aviso "Print guardado com a reunião." e o botão **Desfazer**. A miniatura aparece na aba **Prints**. |
| **Desfazer** logo depois. | O print some e nada fica guardado. |
| Vá para outra aba do navegador e clique em **Print**. | Recusa com "Vá até a aba da reunião e tente de novo…". **Nenhuma imagem de outra aba é salva.** |
| Na aba **Prints**, abra uma miniatura e apague. | O print sai da lista. |

## 10. Perguntar à IA com contexto

| Passo | Resultado esperado |
| --- | --- |
| Selecione uma fala e clique em **Perguntar sobre o trecho**. | Vai para a aba Conversa. O trecho aparece acima do campo, com o nome da reunião, e pode ser removido no ×. |
| Sem o assistente conectado, antes de escrever. | O aviso "Sem assistente conectado…" está visível. |
| Envie a pergunta. | A pergunta fica salva, com o contexto. Sem assistente, a resposta é o estado honesto ("A pergunta ficou guardada na conversa") — **sem** indicador de processamento infinito. |
| Na aba **Reunião**, abra a **Pergunta rápida** ("O que você quer saber desta reunião?"). | Com o assistente conectado, a resposta vem ali mesmo, sem trocar de aba. |

## 11. Saída, histórico e exportação

| Passo | Resultado esperado |
| --- | --- |
| **Finalizar** (ou saia da reunião). | A sidebar abre a reunião recém-salva e a cápsula fica em `salva` (sem nenhuma fala, não há transcrição salva). |
| Sidebar → ícone **Reuniões** (topo). | A reunião está lá. |
| Abra-a. | Nota editável e transcrição. |
| Ícone **Abrir HOME** (topo da sidebar). | A aba da HOME abre (ou é focada). Em **Reuniões**, a reunião tem nota e marcações; **Baixar .txt** gera o arquivo com título, data e as falas na ordem, sem notas nem marcas. |

## 12. Nova participação no mesmo link

Este é o cenário que a regra de autorização por participação existe para
cobrir. **Não pule.**

| Passo | Resultado esperado |
| --- | --- |
| Autorize e capture uma reunião. Saia da chamada. | Cápsula em `salva`. |
| Entre **de novo no mesmo link**, em menos de 10 minutos. | **Não** pergunta de novo: é a mesma participação, retomada, e a transcrição continua. |
| Saia, espere **mais de 10 minutos**, e entre no mesmo link. | **Pergunta de novo.** A captura fica desligada até você responder. |
| Feche o Chrome por completo, reabra e entre no mesmo link. | **Pergunta de novo**, mesmo que a última resposta tenha sido "sim". |
| Confira o histórico. | As reuniões anteriores continuam todas lá — o que expira é a permissão, não o registro. |

## 13. Apagar o que foi guardado

Na HOME. Cada remoção pergunta antes, e o texto da pergunta faz parte do teste:
uma confirmação que não diz o que vai junto é o defeito.

| Passo | Resultado esperado |
| --- | --- |
| **Reuniões** → abra a reunião → lixeira no topo da coluna **Notas da reunião**. | Pergunta "Apagar as notas desta reunião?", dizendo que **a transcrição não é afetada**. |
| **Cancelar**. | A nota continua inteira no campo. |
| Escreva uma linha nova na nota e, **sem esperar**, clique na lixeira → **Apagar**. | Campo vazio, e ele **continua vazio** depois de uns segundos. A última tecla digitada não pode ressuscitar a nota. |
| Volte para a lista de Reuniões. | A reunião **não** mostra mais indício de nota. A transcrição está lá, inteira. |
| Com a nota vazia, olhe o topo da coluna. | **Não** há lixeira: sem nota, não há o que apagar. |
| **Documentos** → passe o mouse sobre um item. | A lixeira do item acende no fim da linha. |
| Clique nela. | O item vira a pergunta, no lugar dele. Os outros itens continuam itens. A pergunta diz que **a reunião de origem não é afetada**. |
| **Apagar**. | O documento sai da lista. A reunião de origem continua no histórico. |
| Abra um documento e use o menu secundário do rodapé → **Apagar documento**. | Mesma pergunta, e ao apagar a tela volta para a lista. |
| Menu de **conversas** (canto superior direito) → lixeira de uma linha. | A linha vira a pergunta, com o título da conversa. As outras continuam clicáveis. |
| **Esc**. | Desfaz a pergunta, **sem** fechar o menu. Um segundo **Esc** fecha o menu. |
| Apague a conversa que está **aberta na tela**. | A tela passa a mostrar a conversa mais recente que sobrou — nunca as mensagens da que acabou de sumir. |
| Apague a última conversa que restava. | "Nenhuma conversa guardada ainda…" e a tela de abertura. |

> Com a sincronização **ligada** (Conexões), cada remoção destas deve virar uma
> remoção no servidor na passada seguinte — ver `src/features/sync/`. Um item
> que continue no acervo depois de apagado aqui é defeito grave; registre.

---

## O que registrar

Para cada item: **passou / falhou / não deu para testar**, e, quando falhar, o
que apareceu na tela e o que o console do service worker mostrou
(`chrome://extensions` → TaqCiti → "service worker").
