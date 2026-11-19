# Como instalar a extensão TaqCiti

A extensão funciona tanto no **Google Chrome** quanto no **Microsoft Edge**
(os dois são baseados em Chromium e carregam extensões do mesmo jeito) — em
Windows, macOS ou Linux.

Existem dois caminhos, e os dois entregam a mesma extensão:

- **Pedir a um assistente de IA** (recomendado) — o Claude ou o ChatGPT, com
  acesso ao seu computador ou navegador, faz os passos por você.
- **Instalação manual** — você mesmo baixa o `.zip` e carrega a pasta no
  navegador. São quatro passos, descritos abaixo.

> Até 13/11/2026 havia instaladores nativos (`.exe`, `.pkg`, `.run`) e um
> guia `COMECE_AQUI.html`. Eles foram abandonados: carregar a pasta da
> extensão é mais simples do que qualquer instalador, e um assistente faz isso
> sozinho.

---

## 1. Pedindo a um assistente de IA (recomendado)

Diga ao assistente algo como:

> Instale a extensão TaqCiti no meu Chrome (ou Edge): baixe o
> `taqciti-vX.Y.Z.zip` da última release em
> https://github.com/lupusbit-coder/taqciti/releases, extraia numa pasta
> fixa que eu não vá apagar, e carregue essa pasta em `chrome://extensions`
> com o Modo do desenvolvedor e "Carregar sem compactação".

Alguns assistentes não conseguem mexer na página `chrome://extensions` (o
navegador protege as páginas internas). Nesse caso eles deixam a pasta
pronta e você faz só os passos 2 a 4 da seção abaixo.

---

## 2. Instalação manual (a partir do `.zip`)

Vale nos três sistemas operacionais e nos dois navegadores — só muda o
endereço da página de extensões.

### 1. Baixe e descompacte

Baixe o `taqciti-vX.Y.Z.zip` da [última
release](https://github.com/lupusbit-coder/taqciti/releases) (ou gere com
`npm run package`), salve numa pasta fixa do computador (ex.: área de
trabalho) e extraia. **Não apague nem mova essa pasta depois** — é dela
que o navegador vai ler os arquivos direto; movê-la ou apagá-la quebra a
extensão.

### 2. Abra a página de extensões do seu navegador

| Navegador | Endereço |
|---|---|
| Google Chrome | `chrome://extensions` |
| Microsoft Edge | `edge://extensions` |

Copie e cole o endereço correspondente na barra de endereços e aperte
Enter.

### 3. Ative o "Modo do desenvolvedor"

- **Chrome**: interruptor no canto superior direito da página.
- **Edge**: interruptor na barra lateral esquerda da página.

### 4. Carregue a extensão

Com o modo do desenvolvedor ativo, clique em **"Carregar sem
compactação"** (o texto do botão é o mesmo nos dois navegadores) e
selecione a pasta que você descompactou no passo 1 — a pasta em si, não o
arquivo `.zip`.

Pronto! A extensão TaqCiti vai aparecer na lista e já está pronta para uso.

---

### Perguntas frequentes

**Preciso repetir esses passos toda vez que abrir o navegador?**
Não. Depois de carregada, a extensão fica instalada normalmente, como
qualquer outra.

**Recebi uma versão nova. O que eu faço?**
Descompacte o novo arquivo `.zip` em uma pasta separada, vá na página de
extensões do seu navegador, remova a versão antiga (botão "Remover") e
repita o passo 4 apontando para a pasta nova.

**O navegador mostra um aviso dizendo que o "Modo do desenvolvedor" pode
ser perigoso. É normal?**
Sim. Esse aviso aparece para qualquer extensão carregada dessa forma (fora
da loja oficial) e não indica nenhum problema com a TaqCiti.

**O navegador avisa que a extensão pode "ler e alterar todos os seus dados
nos sites que você visita". Por quê?**
Porque a extensão atua dentro de uma página (o Google Meet), e o navegador usa
esse texto geral para qualquer extensão que lê uma página. O acesso declarado é
**só a `meet.google.com`** (desde 13/11/2026; antes cobria todos os sites): é lá
que o TaqCiti desenha a **cápsula** e lê as legendas da reunião. Nenhuma outra
página recebe a cápsula nem é lida. Ao atualizar, o navegador não pede nova
aprovação, porque o acesso só diminuiu.

**O que sai do meu computador?**
Por padrão, nada: a transcrição, as notas, as marcações e os prints ficam no
armazenamento local do navegador. Duas coisas saem, e as duas começam com um
clique seu:

- **Gerar documento** manda a transcrição daquela reunião para o servidor do
  TaqCiti, que devolve a ata;
- **Conexões → ligar a sincronização** passa a enviar as reuniões para o
  servidor, para que um cliente de IA possa lê-las pelo conector. Enquanto
  você não ligar, ela fica desligada, e o resto do produto funciona igual.

Apagar uma reunião, um documento, uma conversa ou uma nota remove a cópia deste
computador — e, se a sincronização estiver ligada, a próxima passada apaga a
cópia do servidor também. O que sumiu daqui some de lá; não é preciso repetir a
remoção em dois lugares.
