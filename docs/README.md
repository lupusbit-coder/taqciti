# Documentação do TaqCiti

Ponto de entrada de tudo o que está documentado. Para quem vai **mexer no código**, comece
pelo [`CLAUDE.md`](../CLAUDE.md) da raiz: comandos, convenções e as armadilhas que já
custaram caro. Para quem vai **instalar ou usar**, vá a [`INSTALL.md`](../INSTALL.md) e à
[ajuda do TaqCiti](ajuda-do-taqciti.md).

> **O que não está aqui, de propósito.** Este repositório é público. A documentação
> descreve variáveis de ambiente só pelo NOME e pela função; não traz chaves, URLs de
> produção, IDs de conta ou de projeto, nem conteúdo de reunião real. Exemplos e fixtures
> usam dados inventados.

As datas entre parênteses são da **última alteração** de cada documento: batem com
`git log -1 --format=%ad --date=short -- <arquivo>` no dia em que foram anotadas. Quem edita um
documento atualiza a data dele aqui, no mesmo commit; sem isso, a data passa a mentir.

## Arquitetura (o estado atual do código)

Seis documentos, um por área (`taq-assistente.md` também lista a versão de instruções da revisão da transcrição). Cada um aponta arquivos e linhas, registra as decisões e as
armadilhas que os comentários do código guardam, e diz como testar a área.

| Documento | Cobre |
|---|---|
| [`arquitetura/extensao-captura.md`](arquitetura/extensao-captura.md) | Captura da reunião no Meet: detecção da sala, legendas, portão de consentimento, estados, cápsula, abertura da sidebar, mensageria, persistência, revisão da transcrição por IA, importação de arquivo e automações pós-reunião (atualizado em 13/11/2026) |
| [`arquitetura/extensao-interface.md`](arquitetura/extensao-interface.md) | As telas (Home, sidebar, página do documento), o padrão de plataforma, componentes compartilhados, tema e tipografia (DM Sans), fluxo de gerar documento, importar reunião e automações (atualizado em 13/11/2026) |
| [`arquitetura/taq-assistente.md`](arquitetura/taq-assistente.md) | O assistente Taq: ciclo do turno, ferramentas e seus limites, memória, subsistemas, automações pós-reunião, servidor e prompts (atualizado em 13/11/2026) |
| [`arquitetura/servidor-documentos.md`](arquitetura/servidor-documentos.md) | Geração de documentos: pipeline, agentes, modelo de dados, compilador e variantes visuais, guardas de fidelidade, camada de IA, rotas (atualizado em 13/11/2026) |
| [`arquitetura/conector-sync-integracoes.md`](arquitetura/conector-sync-integracoes.md) | Conector MCP, sincronização, esquema do servidor, identidade, integrações Google e segurança (atualizado em 13/11/2026) |
| [`arquitetura/build-release-operacao.md`](arquitetura/build-release-operacao.md) | Estrutura do repositório, builds, testes, CI, release, deploy e checklist de publicação (atualizado em 13/11/2026; sem instaladores desde então) |

## Produto e processo

| Documento | Para quê |
|---|---|
| [`ajuda-do-taqciti.md`](ajuda-do-taqciti.md) | Referência de ajuda ao usuário, verificada contra a interface (atualizado em 13/11/2026) |
| [`taq-agentes.md`](taq-agentes.md) | Arquitetura, contratos e especialistas do Taq (atualizado em 21/10/2026) |
| [`taq-progresso.md`](taq-progresso.md) | Estado das etapas do Taq e do que foi medido (atualizado em 11/11/2026, revisado contra o código; rodadas ao vivo até 03/10/2026) |
| [`segundo-cerebro.md`](segundo-cerebro.md) | O "segundo cérebro": estado dos pontos, acompanhamentos e decisões (atualizado em 11/11/2026, revisado contra o código; o mapa de contextos do Preparar é de 28/10/2026) |
| [`documentos-personalizados.md`](documentos-personalizados.md) | Documentos pedidos em linguagem natural, no padrão visual do CITi (atualizado em 13/11/2026) |
| [`redesenho-dos-documentos.md`](redesenho-dos-documentos.md) | Diagnóstico e plano para tornar os documentos úteis e fiéis (atualizado em 13/11/2026; fidelidade implementada; a estrutura nova da Ata e do Resumo também, desde 28/10/2026; os demais tipos ficam como estão) |
| [`exemplos/`](exemplos/README.md) | Ata e Resumo de exemplo em PDF, gerados de uma reunião inventada, com o modelo de cada documento (atualizado em 28/10/2026) |
| [`roteiro-reuniao-real.md`](roteiro-reuniao-real.md) | Roteiro manual para testar numa reunião de verdade (atualizado em 13/11/2026) |
| [`verification/`](verification) | Relatórios das passadas de verificação no navegador (atualizado em 11/11/2026) |

## Integrações e segurança

| Documento | Para quê |
|---|---|
| [`plano-de-seguranca.md`](plano-de-seguranca.md) | Mapa das fragilidades e plano de correção em fases (atualizado em 11/11/2026; as fases 1 a 3 estão commitadas: servidor, extensão e política de dados/conector; a 4 em parte, no `1d5dee5` — falta o *environment* com aprovação; Drive e instaladores saíram em 13/11/2026; a 5 depende de decisões) |
| [`lgpd-rascunho.md`](lgpd-rascunho.md) | Rascunho da LGPD para decisão: base legal, provedores fora do Brasil, retenção, titulares e incidente (atualizado em 13/11/2026) |
| [`google-oauth-setup.md`](google-oauth-setup.md) | Configuração do cliente OAuth do Google e dos escopos, com o `npm run check:oauth` (atualizado em 13/11/2026) |
| [`integracoes-google-workspace.md`](integracoes-google-workspace.md) | O que o Taq faz em Gmail, Agenda e Docs, e como (atualizado em 13/11/2026) |

## Servidor (`server/`)

| Documento | Para quê |
|---|---|
| [`server/README.md`](../server/README.md) | Visão do servidor, contratos das rotas e variáveis (atualizado em 13/11/2026) |
| [`server/lib/ai/README.md`](../server/lib/ai/README.md) | A camada de provedores de IA (atualizado em 13/11/2026) |
| [`server/lib/conector/README.md`](../server/lib/conector/README.md) | O conector MCP, em detalhe (atualizado em 13/11/2026) |
| [`server/docs/deploy.md`](../server/docs/deploy.md) | Como o servidor vai ao ar, na Vercel (atualizado em 11/11/2026, revisado contra o código) |
| [`server/docs/HANDOFF.md`](../server/docs/HANDOFF.md) | Histórico de decisões do servidor. **Parcialmente superado**: ver [`arquitetura/servidor-documentos.md`](arquitetura/servidor-documentos.md) (atualizado em 13/11/2026) |
| [`server/docs/divida-verificacao-provedores.md`](../server/docs/divida-verificacao-provedores.md) | Dívida de verificação dos provedores de IA (atualizado em 13/11/2026) |

## Distribuição

| Documento | Para quê |
|---|---|
| [`INSTALL.md`](../INSTALL.md) | Instalação da extensão (atualizado em 13/11/2026) |
| [`publicar-release.md`](publicar-release.md) | Passo a passo para cortar e conferir uma release (atualizado em 13/11/2026: só o zip da extensão, sem instaladores nem Drive) |

## Como manter isto em dia

- Mudou uma decisão no código? Atualize o comentário de topo do arquivo **e** o documento
  de `arquitetura/` da área, no mesmo commit.
- Um documento que descreve o que "vai ser feito" deve dizer a data e o que já foi feito
  (veja `redesenho-dos-documentos.md`); documento sem data envelhece sem aviso.
- Antes de commitar um `.md`, procure chave, URL de deploy, ID de conta e nome de pessoa ou
  de cliente. Em dúvida, troque por um placeholder descritivo (`<URL-DE-PRODUCAO>`).
