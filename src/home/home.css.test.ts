/**
 * Invariantes de composição que só o CSS decide — e que já foram quebradas.
 *
 * Isto não substitui olhar a tela; nenhuma asserção sobre texto de CSS prova
 * que algo *parece* certo. O que ela prova é o contrário: que uma regra
 * específica, cuja violação tem sintoma conhecido, não voltou. As três aqui são
 * exatamente as que produziram os defeitos relatados:
 *
 *   1. compositor e onda presos na janela (`fixed`/`sticky`), que é o que
 *      fazia a escrita parecer um rodapé e a animação acompanhar a leitura do
 *      histórico em vez de sair da tela;
 *   2. a camada da animação interceptando clique, seleção e rolagem;
 *   3. o texto exibido selecionável, com o realce de seleção quebrando a
 *      superfície — e a exceção do campo de escrita sumindo junto.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Caminho a partir da raiz do projeto: o ambiente do Vitest aqui é jsdom, e
// `import.meta.url` chega como `http://localhost/...`, que `fileURLToPath`
// recusa.
const css = readFileSync(resolve(process.cwd(), 'src/home/home.css'), 'utf8');

/** O corpo da primeira regra cujo seletor casa exatamente. */
function bloco(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const achado = new RegExp(`(^|[,}])\\s*${escapado}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!achado) throw new Error(`regra não encontrada: ${seletor}`);
  return achado[2] ?? '';
}

describe('a conversa, a escrita e a onda pertencem ao mesmo fluxo', () => {
  it.each(['.tq-palco', '.tq-conversa', '.tq-escrita', '.tq-campo', '.tq-wave'])(
    '%s não se prende à janela',
    (seletor) => {
      const regra = bloco(seletor);
      expect(regra).not.toMatch(/position:\s*fixed/);
      expect(regra).not.toMatch(/position:\s*sticky/);
    },
  );

  /* A onda é ancorada ao FIM do conteúdo, e é isso que a faz rolar junto. */
  it('a onda é absoluta dentro do miolo, com o miolo como referência', () => {
    expect(bloco('.tq-wave')).toMatch(/position:\s*absolute/);
    expect(bloco('.tq-main')).toMatch(/position:\s*relative/);
  });
});

describe('a animação é fundo, e só fundo', () => {
  it('não intercepta clique, seleção nem rolagem', () => {
    expect(bloco('.tq-wave')).toMatch(/pointer-events:\s*none/);
  });

  /* Sem a máscara, a borda de cima do canvas vira a linha reta que cortava a
     página em duas — o "corte horizontal". */
  it('dissolve no fundo por máscara, sem revelar a borda do canvas', () => {
    expect(bloco('.tq-wave')).toMatch(/mask-image:\s*linear-gradient\(to bottom, transparent/);
  });
});

describe('a seção escolhida na navegação', () => {
  it('tem contorno verde e uma animação própria', () => {
    const regra = bloco(`.tq-navlinks button[aria-current='page']`);
    expect(regra).toMatch(/border-color:\s*rgb\(var\(--c-primary\)/);
    expect(regra).toMatch(/animation:\s*tq-selecao/);
    expect(css).toMatch(/@keyframes tq-selecao/);
  });

  /* O contorno não pode empurrar o rótulo ao aparecer. */
  it('todos os itens reservam a borda, não só o escolhido', () => {
    expect(bloco('.tq-navlinks button')).toMatch(/border:\s*1px solid transparent/);
  });
});

describe('o compositor não ganha moldura ao ser focado', () => {
  /*
   * `:focus-visible` casa num campo de texto sempre que ele recebe foco,
   * inclusive por clique — então a regra genérica de foco desenhava um
   * retângulo verde de 2px em volta do campo no instante em que se clicava
   * para escrever. Era a caixa que este compositor existe para não ter, e só
   * aparecia no estado focado.
   */
  it('o campo de escrita cancela o contorno de foco', () => {
    expect(css).toMatch(/\.tq-campo textarea:focus-visible\s*\{[^}]*outline:\s*none/);
  });

  it('o foco no campo realça a linha inferior do compositor', () => {
    expect(bloco('.tq-campo')).toMatch(/border-bottom:/);
    expect(bloco('.tq-campo:focus-within')).toMatch(/border-color:\s*var\(--ideia\)/);
  });
});

describe('o cursor nativo e o desenhado nunca coexistem', () => {
  /*
   * A causa do cursor aparecendo onde não devia: `cursor: none` era
   * incondicional, e a camada desenhada era ligada por JavaScript. Amarradas à
   * mesma classe, ou há um ou há o outro — nunca os dois, nunca nenhum.
   */
  it('esconder o cursor do sistema depende da camada estar acesa', () => {
    expect(css).toMatch(/body\.tq-pointer-in \.tq-home,\s*body\.tq-pointer-in \.tq-home \*\s*\{[^}]*cursor:\s*none/);
  });

  it('não existe `cursor: none` fora dessa condição', () => {
    const regras = css.match(/[^{}]+\{[^}]*cursor:\s*none[^}]*\}/g) ?? [];
    expect(regras).toHaveLength(1);
    expect(regras[0]).toContain('tq-pointer-in');
  });

  // O I-beam e a alça de `resize: vertical` são informação que o ponto
  // desenhado não substitui: nos campos, o cursor volta a ser o do sistema.
  it('nos campos de texto o cursor é o do sistema', () => {
    expect(css).toMatch(
      /body\.tq-pointer-in \.tq-home\s*:is\([\s\S]*?textarea,[\s\S]*?\)\s*\{\s*cursor:\s*auto/,
    );
  });

  // Uma versão ficava, menor, por cima do I-beam e da barra de digitação.
  // No campo a onda desenhada sai inteira.
  it('nos campos de texto a onda desenhada some por completo', () => {
    expect(css).toMatch(/body\.tq-pointer-in \.tq-halo\.sobre-campo\s*\{[^}]*opacity:\s*0/);
  });

  /*
   * A ponta da seta (1,6; 1,6 no `viewBox`, ver SETA em PointerLayer.tsx) tem
   * de cair no mouse: o desenho é deslocado exatamente isso. E o afundar do
   * clique gira em torno da mesma ponta, para o alvo não se mexer.
   */
  it('a ponta da seta é o ponto quente', () => {
    expect(bloco('.tq-rotor')).toMatch(/left:\s*-1\.6px/);
    expect(bloco('.tq-rotor')).toMatch(/top:\s*-1\.6px/);
    expect(bloco('.tq-cursor-seta')).toMatch(/transform-origin:\s*1\.6px 1\.6px/);
  });

  // Pedido do usuário: o cursor muda de cor — e para, com o movimento reduzido.
  it('a cor corre só com movimento', () => {
    expect(css).toMatch(/\.tq-halo\[data-movimento='sim'\] \.tq-cursor-cor-a\s*\{[^}]*animation:\s*tq-cursor-cor/);
    expect(css).toMatch(/@keyframes tq-cursor-cor/);
  });

  // Pedido do usuário (23/11/2026): a ponta da onda é o alvo, sem bolinha.
  it('não existe mais a bolinha branca', () => {
    expect(css).not.toContain('tq-dot');
  });

  /*
   * A vibração só aumenta no clique. A primeira onda acelerava sobre botões e
   * sobre o Taq e vivia agitada: nenhum estado de "sobre" pode mexer no ritmo.
   */
  it('só o clique muda o ritmo da onda', () => {
    const regrasComAnimacao = css.match(/[^{}]+\{[^}]*animation[^}]*\}/g) ?? [];
    const doCursor = regrasComAnimacao.filter((r) => r.includes('tq-cursor-barra'));
    expect(doCursor).toHaveLength(2);
    expect(doCursor.some((r) => r.includes('.pressionado'))).toBe(true);
    expect(doCursor.some((r) => /sobre-/.test(r))).toBe(false);
  });
});

describe('o texto exibido não é selecionável, o rascunho é', () => {
  it('a tela inteira bloqueia a seleção', () => {
    expect(bloco('.tq-home')).toMatch(/user-select:\s*none/);
  });

  it('o campo de escrita é a exceção', () => {
    expect(css).toMatch(
      /\.tq-home textarea,\s*\.tq-home input\s*\{[^}]*user-select:\s*text/,
    );
  });
});

/*
 * O reset do botão não pode vencer as classes de botão. Escrito como
 * `.tq-home button` (0,1,1), ele apagava a moldura do `.tq-acao`, o verde do
 * `.tq-acao-principal` e o vermelho do `.tq-acao-perigo`: "Reproduzir",
 * "Pedir alteração" e "Aplicar ao meu assistente" viravam texto solto
 * (varredura de 11/11/2026). Com `:where`, o reset tem especificidade zero na raiz.
 */
describe('o reset do botão perde para qualquer classe de botão', () => {
  it('o reset mora em :where(.tq-home), não em .tq-home', () => {
    expect(bloco(':where(.tq-home) button')).toMatch(/border:\s*0/);
    expect(css).not.toMatch(/(^|[,}])\s*\.tq-home button\s*\{/m);
  });

  it('as classes de ação dizem moldura e cor, que agora valem', () => {
    expect(bloco('.tq-acao')).toMatch(/border:\s*1px solid/);
    expect(bloco('.tq-acao-principal')).toMatch(/background:/);
  });
});
