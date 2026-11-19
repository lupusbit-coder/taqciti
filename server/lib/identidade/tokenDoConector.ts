/**
 * O segredo que a Claude e o ChatGPT apresentam para provar de quem é o
 * acervo.
 *
 * ── Por que não é o token do Google ───────────────────────────────────────
 *
 * Porque o token do Google é da EXTENSÃO: curto-vivo, renovado pelo Chrome,
 * e só existe dentro do navegador da pessoa. A Claude não tem como obtê-lo e
 * não deveria — ela é outro programa, num servidor de outra empresa.
 *
 * Então são duas credenciais para dois caminhos:
 *
 *   extensão → servidor   token do Google, verificado a cada uso
 *   Claude   → servidor   este token, criado pela pessoa, revogável
 *
 * ── Por que não OAuth ─────────────────────────────────────────────────────
 *
 * O jeito completo seria este servidor ser um servidor OAuth, com registro
 * dinâmico de cliente. É bastante máquina, e o requisito era "sem login". Um
 * token que a pessoa copia da página Conexões e cola ao adicionar o conector
 * faz o mesmo trabalho sem nenhuma tela de autenticação.
 *
 * O preço é honesto e vale estar escrito: é uma credencial ao portador. Quem
 * tiver a URL tem o acervo. O que torna isso administrável está implementado
 * aqui — o token aparece UMA vez, o banco guarda só o hash, revogar é
 * imediato, e (S6 do plano de segurança, 11/2026) cada token tem prazo
 * absoluto de `DIAS_DE_VALIDADE` (`expira_em`), além do prazo de inatividade,
 * e cada pessoa tem no máximo `MAX_TOKENS_ATIVOS` ao mesmo tempo.
 *
 * ── Hash, e por que não é bcrypt ──────────────────────────────────────────
 *
 * Senha precisa de hash lento porque é curta, escolhida por gente e
 * adivinhável. Isto é 256 bits de aleatoriedade de `randomBytes` — não há
 * dicionário, e força bruta contra SHA-256 sobre 2^256 não é uma ameaça que
 * um fator de trabalho melhore. O que importa é não guardar o original, e
 * comparar em tempo constante.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type Consultador, banco } from '@/lib/conector/banco';
import { emailPermitido } from './dominio';

/**
 * O prefixo existe para o token ser reconhecível fora de contexto — num
 * suporte, num log de alguém, numa captura de tela — e para um varredor de
 * segredo saber o que está olhando.
 */
const PREFIXO = 'taqciti_';

/** 32 bytes = 256 bits. Base64url para caber numa URL sem escapar nada. */
function sortearToken(): string {
  return PREFIXO + randomBytes(32).toString('base64url');
}

/** Dias sem uso depois dos quais um token deixa de valer. */
export function diasDeInatividade(): number {
  const v = Number(process.env.TAQCITI_TOKEN_INATIVO_DIAS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 90;
}

/**
 * Prazo absoluto de um token, em dias desde a criação. A inatividade sozinha
 * não segura uma URL vazada que alguém continua usando: ela nunca fica parada.
 * Com o prazo, o pior caso de um vazamento não percebido tem fim.
 */
export const DIAS_DE_VALIDADE = 90;

/**
 * Quantos tokens ativos uma pessoa pode ter ao mesmo tempo. Era 5; desce a 3
 * (S6): a pessoa usa o conector na Claude e no ChatGPT, e sobra um para trocar
 * de máquina. Cada token a mais é uma credencial ao portador para o acervo
 * inteiro. Quem já tinha mais continua com os seus valendo; só não cria outro
 * até revogar.
 */
export const MAX_TOKENS_ATIVOS = 3;

/**
 * A regra de "token que vale", num lugar só: não revogado, dentro do prazo
 * absoluto e usado (ou criado) dentro do prazo de inatividade. É a MESMA para
 * aceitar o token (`pessoaDoToken`), contar vaga (`contarTokens`) e listar
 * (`listarTokens`): um token morto por inatividade que ainda contasse vaga ou
 * aparecesse na lista faria a pessoa achar que o conector funciona — e a
 * impediria de criar outro. `$dias` é o índice do parâmetro com
 * `diasDeInatividade()`; `t` é o alias da tabela.
 */
const tokenValido = (dias: number, t = 'token_do_conector'): string =>
  `${t}.revogado_em is null and ${t}.expira_em > now() ` +
  `and coalesce(${t}.usado_em, ${t}.criado_em) > now() - make_interval(days => $${dias})`;

/** Quantos tokens VÁLIDOS a pessoa tem agora (revogar apaga a linha; vencido não conta). */
export async function contarTokens(pessoaId: string, pool: Consultador = banco()): Promise<number> {
  const { rows } = await pool.query(
    `select count(*) as n from token_do_conector where pessoa_id = $1 and ${tokenValido(2)}`,
    [pessoaId, diasDeInatividade()],
  );
  return Number(rows[0]?.n ?? 0);
}

type ComTransacao = Partial<{
  /** PGlite (testes). */
  transaction<R>(fn: (tx: Consultador) => Promise<R>): Promise<R>;
  /** `pg.Pool` (produção): um cliente dedicado, para o BEGIN valer. */
  connect(): Promise<Consultador & { release(erro?: Error): void }>;
}>;

/** Roda `fn` numa transação, no driver que estiver aí (PGlite ou `pg.Pool`). */
async function emTransacao<R>(pool: Consultador, fn: (tx: Consultador) => Promise<R>): Promise<R> {
  const driver = pool as Consultador & ComTransacao;
  if (typeof driver.transaction === 'function') return driver.transaction(fn);
  if (typeof driver.connect !== 'function') throw new Error('O banco não oferece transação.');
  const cliente = await driver.connect();
  // Se nem o rollback funcionar, a conexão está num estado desconhecido (talvez
  // ainda dentro da transação): `release(erro)` faz o `pg` destruí-la em vez de
  // devolvê-la ao pool para o próximo pedido herdar.
  let quebrado: Error | undefined;
  try {
    await cliente.query('begin');
    const resultado = await fn(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (erro) {
    await cliente.query('rollback').catch((falha: unknown) => {
      quebrado = falha instanceof Error ? falha : new Error(String(falha));
    });
    throw erro;
  } finally {
    cliente.release(quebrado);
  }
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface TokenCriado {
  /** O token em claro. É a ÚNICA vez que ele existe fora do navegador. */
  token: string;
  id: string;
}

/**
 * Cria um token para uma pessoa e devolve o valor em claro UMA vez — ou `null`
 * quando ela já tem `MAX_TOKENS_ATIVOS` válidos.
 *
 * Quem chamar precisa entregá-lo à pessoa nessa mesma resposta: não há como
 * recuperá-lo depois, porque o banco só tem o hash. Perdeu, cria outro e
 * revoga o anterior.
 *
 * Contar e inserir são ATÔMICOS: numa transação, com
 * `pg_advisory_xact_lock(hashtext(pessoa_id))` antes da contagem. Contar e
 * depois inserir em chamadas soltas deixava dois pedidos simultâneos verem a
 * mesma vaga e passarem do teto. Também não serve um `insert ... select ...
 * where (select count(*)) < 3` sozinho: no READ COMMITTED, cada comando conta
 * com a foto do começo dele e também não vê o insert concorrente. Com a trava
 * (que dura até o fim da transação), o segundo pedido espera, e a contagem
 * dele, feita num comando seguinte, já enxerga o token do primeiro.
 */
export async function criarTokenDoConector(
  pessoaId: string,
  rotulo?: string,
  pool: Consultador = banco(),
): Promise<TokenCriado | null> {
  return emTransacao(pool, async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1::text))', [pessoaId]);
    // Token que não vale mais (prazo ou inatividade) não serve para nada: sai
    // aqui, de carona, em vez de acumular.
    await tx.query(`delete from token_do_conector where pessoa_id = $1 and not (${tokenValido(2)})`, [
      pessoaId,
      diasDeInatividade(),
    ]);
    if ((await contarTokens(pessoaId, tx)) >= MAX_TOKENS_ATIVOS) return null;
    const token = sortearToken();
    const { rows } = await tx.query(
      `insert into token_do_conector (pessoa_id, hash, rotulo, expira_em)
       values ($1, $2, $3, now() + make_interval(days => $4)) returning id`,
      [pessoaId, hashDoToken(token), rotulo ?? null, DIAS_DE_VALIDADE],
    );
    const id = rows[0]?.id;
    if (typeof id !== 'string') throw new Error('token_do_conector não devolveu id.');
    return { token, id };
  });
}

/**
 * Resolve um token na pessoa dona dele, ou `null`.
 *
 * `null` e não exceção porque "token errado" é o caso comum de uma rota
 * pública: vira 401, não 500.
 *
 * A comparação é feita pelo banco, por igualdade de hash indexado — e isso
 * NÃO é um vazamento de tempo explorável, porque o que se compara já é a
 * saída do SHA-256. Um atacante não consegue caminhar byte a byte até o
 * token: ele teria que caminhar até o hash, e um hash parcialmente certo não
 * ajuda a construir a entrada que o produz. A comparação em tempo constante
 * abaixo é a do valor recalculado, por hábito e custo zero.
 */
export async function pessoaDoToken(
  token: string,
  pool: Consultador = banco(),
): Promise<string | null> {
  if (!token?.startsWith(PREFIXO)) return null;
  const hash = hashDoToken(token);

  // Um token parado há mais de `diasDeInatividade()` não vale mais: é a URL
  // esquecida num conector abandonado, num print ou num log antigo. Quem usa o
  // conector de verdade nunca chega perto do prazo, porque cada uso o renova.
  // `expira_em` é o outro prazo, o absoluto, que o uso NÃO renova.
  const { rows } = await pool.query(
    `select t.pessoa_id, t.hash, p.email
       from token_do_conector t join pessoa p on p.id = t.pessoa_id
      where t.hash = $1 and ${tokenValido(2, 't')}`,
    [hash, diasDeInatividade()],
  );
  const linha = rows[0];
  if (!linha) return null;

  const guardado = String(linha.hash);
  const a = Buffer.from(hash, 'utf8');
  const b = Buffer.from(guardado, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // O token é da pessoa, e a pessoa tem que ser da organização AGORA: um token
  // criado quando a regra era frouxa não pode seguir entregando o acervo de
  // quem não é do CITI. Recusa como token revogado, sem dizer o motivo a quem
  // só tem a URL.
  if (!emailPermitido(String(linha.email))) return null;

  // `usado_em` alimenta a página Conexões ("último uso") e é o que permite
  // alguém notar um token que continua sendo usado depois de a pessoa achar
  // que tinha parado. Não bloqueia a resposta.
  void pool
    .query('update token_do_conector set usado_em = now() where hash = $1', [hash])
    .catch(() => {
      /* registrar o uso é conveniência; falhar nisso não pode negar acesso. */
    });

  return String(linha.pessoa_id);
}

export interface TokenListado {
  id: string;
  rotulo: string | null;
  criadoEm: string;
  usadoEm: string | null;
  /** Quando o token deixa de valer, mesmo em uso. Campo novo (11/2026): quem não o lê não perde nada. */
  expiraEm: string;
}

/**
 * O que a página Conexões mostra. Nunca o token — ele não existe mais aqui.
 *
 * O filtro de `revogado_em` só pega linhas de antes de revogar virar DELETE.
 * Vencido (por prazo ou por inatividade) não aparece: não vale mais, e listá-lo
 * faria parecer que o conector ainda funciona.
 */
export async function listarTokens(
  pessoaId: string,
  pool: Consultador = banco(),
): Promise<TokenListado[]> {
  const { rows } = await pool.query(
    `select id, rotulo, criado_em, usado_em, expira_em
       from token_do_conector
      where pessoa_id = $1 and ${tokenValido(2)}
      order by criado_em desc`,
    [pessoaId, diasDeInatividade()],
  );
  return rows.map((l) => ({
    id: String(l.id),
    rotulo: l.rotulo === null || l.rotulo === undefined ? null : String(l.rotulo),
    criadoEm: new Date(l.criado_em as string).toISOString(),
    usadoEm: l.usado_em ? new Date(l.usado_em as string).toISOString() : null,
    expiraEm: new Date(l.expira_em as string).toISOString(),
  }));
}

/**
 * Revoga um token apagando a linha. Idempotente, e devolve se algo mudou.
 *
 * `pessoa_id` no WHERE não é zelo: sem ele, saber o id de um token bastaria
 * para revogar o de outra pessoa.
 */
export async function revogarToken(
  pessoaId: string,
  tokenId: string,
  pool: Consultador = banco(),
): Promise<boolean> {
  const { rows } = await pool.query(
    `delete from token_do_conector
      where id = $1 and pessoa_id = $2
      returning id`,
    [tokenId, pessoaId],
  );
  return rows.length > 0;
}
