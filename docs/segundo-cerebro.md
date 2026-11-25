# TaqCiti como segundo cérebro para conduzir reuniões

Estado em 11/11/2026 (revisado contra o código). Este documento descreve o que foi implementado do plano
"segundo cérebro para condução de reuniões", onde está, como verificar e o que
ainda **não** está feito ou validado. Não repete o plano: diz o que existe.

## Princípio que atravessa tudo

O modelo **propõe**; o **código** decide e confere; a **pessoa** autoriza. Nada
muda sozinho, e o que o modelo cita (uma fala) é verificado contra a transcrição
em código.

## O que existe

| Parte | Onde | O que faz |
| --- | --- | --- |
| Assistente (perfil de condução) | `src/features/conducao/store.ts` | Os contextos que a pessoa leva às reuniões (até 8; cada um **ligado**, vai ao modelo, ou **guardado**, não vai) e "ler ao encerrar"; o modo é sempre "só quando eu chamar". Versionado, com conflito por revisão e histórico. |
| Padrão do CITi | `src/features/conducao/padrao.ts` | O assistente que vale sem nada configurado: dois contextos fixos e o modo "só quando eu chamar". Só leitura; quem personaliza parte dele (a cópia é da pessoa, `padraoVersao` diz de qual versão partiu). |
| Mapa de contextos | `src/home/OQueLevar.tsx` (dentro de `Preparar.tsx`) | Blocos "Contexto" e "Personalização" (desde 23/11/2026): o caminho da fala até a resposta, com o que está ligado. Nada é salvo antes de "Usar este assistente"; se outra aba mudou o assistente, a gravação avisa em vez de sobrescrever. Desde `6df3da6` (28/10/2026) é o que a tela Preparar mostra; o briefing saiu da tela nesse mesmo commit. |
| Briefing da reunião | `store.ts` (`briefingDaReuniao`) | Dados de reuniões preparadas antes de 28/10/2026 (`6df3da6`). Não há mais tela para criar um; o que existe continua indo ao modelo para a reunião dele (`conducao/contexto.ts`). |
| Versão da reunião | `store.ts` (`fixarPerfilDaReuniao`) | A reunião fica com a versão do assistente com que **começou**; a tela avisa que mudanças valem só para as próximas. |
| Migração de storage (versão 4 do storage local) | `src/background/storageMigrations.ts`, `migrarConducao` | Converte o perfil antigo de `taq:conducao` (missão, o que observar, preferências) em contextos, preservando o modo. O que não couber fica guardado como estava (`perfilV1`). |
| Retomada | `conducao/retomada.ts` | Combinados em aberto e decisões dos encontros que a pessoa **escolheu** (por id), com data, "sem atualização registrada" e nunca "atrasado". |
| Estado dos pontos | `src/features/estado/`, prompt `estado-v1` | "O que falta fechar": um estado por ponto (a esclarecer, discutido, a confirmar, decidido, adiado) com a fala que o sustenta. Fonte, dono e prazo são conferidos em código. |
| Fechamento | `estado/sintese.ts`, `estado/registrar.ts` | Síntese sobre o estado validado (sem nova chamada ao modelo), frase de fechamento sugerida (rotulada), e por clique: **registrar como acompanhamento** (ponto decidido ou a confirmar, sem dono/prazo inventados) ou **como decisão** (só ponto decidido, com a fala copiada da transcrição). |
| Acompanhamentos | `src/features/acompanhamento/juiz.ts`, prompt `acompanhamento-v1`, `trabalho/store.ts` | No máximo 3 por reunião (`LIMITE_DE_ACOMPANHAMENTOS_POR_REUNIAO`; só cancelado libera vaga). Quem ocupa as vagas é escolhido por um juiz de IA entre ids oferecidos; sem julgamento válido, ninguém entra. O teto é reforçado no armazenamento. |
| ~~Apoio ao vivo~~ | removido em 23/11/2026 | As sugestões automáticas durante a reunião (`src/features/apoio/`, prompt `intervencao-v1`) saíram: o assistente só age quando a pessoa chama. A migração de storage versão 5 apaga `taq:apoio`. |
| ~~Cartão de apoio~~ | removido em 23/11/2026 | O cartão da sidebar (`CartaoDeApoio.tsx`) saiu com o apoio ao vivo. |
| ~~Calibração~~ | removida em 23/11/2026 | Os ajustes sugeridos pelo feedback e o teste histórico saíram do Preparar com a pasta `src/features/calibracao/`: o assistente passou a ser sempre "só quando eu chamar" (topo de `conducao/store.ts`), e não há sugestão automática para calibrar. |
| Ação externa por botão | `taq/orquestrador.ts` (`confirmarAcao`) | E-mail e agenda só saem por clique no cartão; o modelo só prepara a prévia. |

## Garantias verificadas em código (com teste)

- Fala citada que não existe até o corte → recusada; o trecho guardado é copiado da transcrição.
- "Decidido" exige fala com conteúdo; proposta fica "a confirmar"; só reabre com fala posterior.
- A correção da pessoa só cede a fala posterior à correção.
- Dono e prazo só ficam se aparecem na fala citada.
- O modelo **nunca é chamado sozinho** durante a reunião: desde 23/11/2026 "só quando eu chamar" é o único modo, e não há busca na internet.
- Resultado de tarefa antiga (a reunião mudou no meio) não é publicado.
- Apagar a reunião leva o briefing, o estado e a cópia do assistente que ela usava (`emUso`); o assistente fica (`features/annotations/vinculos.ts`).

## Como verificar

- Testes: `npm test` (raiz) e `cd server; npx vitest run lib/taq`. Visão geral do Taq:
  `docs/arquitetura/taq-assistente.md`.
- Tela "Preparar" no navegador: `node scripts/verify-preparar.cjs <playwright-core> <pasta da build de desenvolvimento>` (resultado em `docs/verification/preparar/`).
- Contra o provedor real, com reunião **sintética** (chave gratuita só aceita dado inventado): subir o servidor (`cd server; npx next build; npx next start -p 3100`) e rodar os arquivos `*.live.test.ts` com `TAQ_LIVE_URL` e `TAQ_LIVE_KEY` (ver o cabeçalho de cada um). Cobrem: `estado-v1`, `copilot-v2`, `acompanhamento-v1` (`juiz.live.test.ts`). (A extensão não referencia mais `conducao-v1` em `src/`; o servidor ainda o mapeia em `server/lib/taq/instrucoes.ts:74`.)
- Reunião ao vivo sintética, com a extensão rodando: `scripts/verify-ao-vivo.cjs` (captura de legendas, "O que falta fechar" e a ausência de sugestão automática, contra uma página do Meet simulada). **Rodou verde pela primeira vez em 23/11/2026** (Gemini `gemini-3.5-flash`, política `private` no servidor local), com resultado e capturas em `docs/verification/ao-vivo/`. Exige a política `private`: com `training` o Taq fica "pendente" de propósito e a leitura não roda. Sem conta do Google guardada, "Ler a reunião" abre o login; o script o fecha, como a pessoa faria, e o Taq segue pela ponte do segredo.

## Publicação: servidor antes da extensão

As instruções de sistema moram no servidor, versionadas. A extensão pede pelo nome.
Servidor sem a versão = falha ("Versão de instruções desconhecida", visto na prática).
Versões desta família que o servidor precisa ter (a lista completa das quinze que a
extensão pede está em `docs/arquitetura/taq-assistente.md`): `copilot-v2`, `communication-v3`,
`scheduling-v3`, `estado-v1`, `acompanhamento-v1` (mapeadas em
`server/lib/taq/instrucoes.ts`; a extensão deixou de pedir `conducao-v1` no `6df3da6`). Deploy é manual;
quais já foram publicadas: não verificado.

## O que ainda não está feito ou validado

- **Visto no navegador em 23/11/2026** (`scripts/verify-ao-vivo.cjs`, reunião sintética): o
  cartão de apoio no modo Discreto (sugestão pertinente, marcada como "não é uma fala
  registrada"), o "O que falta fechar" (adiado, decidido com o dono que assumiu, discutido sem
  dono inventado) e a fala de injeção sem efeito em nenhum dos dois. A primeira execução achou
  dois bugs, corrigidos no `dceaff3`: silêncio com a última legenda na tela virava "Erro na
  captura", e a checagem de "assistente conectado" do script dava falso verde. A tela "Preparar" foi
  verificada no Edge com `verify-preparar.cjs`. Desde 23/11/2026 ela tem dois blocos, "Contexto" e
  "Personalização", sem "Ajustes sugeridos" nem "Testar o assistente numa reunião passada".
  Capturas em `docs/verification/preparar/`. **Atenção:** o cartão de apoio no modo Discreto, visto
  nessa volta, não se liga mais pelo produto desde 23/11/2026 (modo único "só quando eu chamar").
- **Provedor real só com o plano gratuito e dado sintético.** Limiares (intervalos, limites,
  conteúdo mínimo, janelas, limiares de feedback) são **ponto de partida**, não medição.
  A latência observada foi de 1 a 20 s por chamada neste provedor.
- O modelo não é determinístico: o estado de um ponto pode variar entre leituras; por isso a
  pessoa corrige, e a correção prevalece.
- **Cliente como entidade** não existe: encontros se ligam por escolha da pessoa, por id.
  Não há "histórico do cliente" nem alcance "cliente" no feedback.
- O estado dos pontos só é atualizado por botão (uma chamada ao modelo lendo as
  últimas 60 falas consolidadas); não há atualização automática.
- O limite de 3 acompanhamentos por reunião é fixo no código; concluir um item não
  libera vaga, só cancelar (a mensagem ao usuário fala em "concluir ou cancelar":
  divergência a conferir).
- **Sem sincronização entre dispositivos** das sugestões, do estado e do perfil (tudo local).
- O "Desfazer" da lixeira do Taq (`lixeira.ts`) guarda o briefing da reunião apagada junto com o resto; a restauração do briefing não foi verificada nesta revisão.
- `politica.ts` (escrita local e ações de interface) e `roteamento.ts` ainda decidem por regex.
- O alcance "reunião / cliente / preferência" no momento do feedback não é perguntado: o
  feedback vale "agora". (A calibração por proposta aprovada saiu em 23/11/2026.)
