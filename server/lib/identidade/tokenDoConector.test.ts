/**
 * Os tokens do conector, contra Postgres de verdade (PGlite — ver o cabeçalho
 * de `lib/conector/acervoPostgres.test.ts`).
 *
 * Dois testes carregam o peso, e os dois são sobre falhas que não fazem
 * barulho:
 *
 * - `o token em claro não fica no banco` — se ficasse, um vazamento do banco
 *   viraria acesso ao acervo de todo mundo, e nada no comportamento normal
 *   denunciaria isso.
 * - `não dá para revogar o token de outra pessoa` — um `pessoa_id` esquecido
 *   no WHERE deixaria qualquer um derrubar o acesso alheio sabendo só um id.
 */
import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Consultador } from '@/lib/conector/banco';
import { garantirPessoa } from '@/lib/conector/pessoa';
import {
  DIAS_DE_VALIDADE,
  MAX_TOKENS_ATIVOS,
  contarTokens,
  criarTokenDoConector,
  hashDoToken,
  listarTokens,
  pessoaDoToken,
  revogarToken,
} from './tokenDoConector';

/** PGlite é em processo, mas a gravação de `usado_em` é disparada sem espera. */
async function ateQue(condicao: () => Promise<boolean>, tentativas = 50): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

describe('token do conector', () => {
  let pglite: PGlite;
  let pool: Consultador;
  let ana: string;
  let bia: string;

  beforeAll(async () => {
    pglite = new PGlite();
    pool = pglite as unknown as Consultador;
    await pglite.exec(
      readFileSync(join(process.cwd(), 'lib', 'conector', 'esquema.sql'), 'utf8'),
    );
    ana = await garantirPessoa({ googleSub: 'sub-ana', email: 'ana@citi.org.br' }, pool);
    bia = await garantirPessoa({ googleSub: 'sub-bia', email: 'bia@citi.org.br' }, pool);
  });

  afterAll(async () => {
    await pglite.close();
  });

  // Com o teto de 3 por pessoa, um teste não pode herdar as vagas que o
  // anterior ocupou: cada um começa sem token nenhum.
  afterEach(async () => {
    await pool.query('delete from token_do_conector');
  });

  /** Cria e afirma que havia vaga — os testes abaixo nunca passam do teto. */
  const criar = async (...args: Parameters<typeof criarTokenDoConector>) => {
    const criado = await criarTokenDoConector(...args);
    if (!criado) throw new Error('sem vaga para criar o token do teste');
    return criado;
  };

  /*
   * S6: contar e criar são uma operação só. Em chamadas soltas, pedidos
   * simultâneos viam a mesma vaga e passavam do teto.
   */
  it('criações em paralelo não passam do teto', async () => {
    const dono = await garantirPessoa({ googleSub: 'sub-paralelo', email: 'paralelo@citi.org.br' }, pool);
    const resultados = await Promise.all(
      Array.from({ length: 8 }, (_, i) => criarTokenDoConector(dono, `p${i}`, pool)),
    );
    expect(resultados.filter(Boolean)).toHaveLength(MAX_TOKENS_ATIVOS);
    expect(resultados.filter((r) => r === null)).toHaveLength(8 - MAX_TOKENS_ATIVOS);
    expect(await contarTokens(dono, pool)).toBe(MAX_TOKENS_ATIVOS);
  });

  it('a transação usa um cliente dedicado quando o driver é um pool (pg)', async () => {
    // Em produção o driver é `pg.Pool`, sem `transaction`: o BEGIN só vale num
    // cliente próprio. Um pool falso que repassa ao PGlite prova o caminho.
    const comandos: string[] = [];
    let liberado = false;
    const poolFalso = {
      query: () => Promise.reject(new Error('fora da transação')),
      connect: async () => ({
        query: (texto: string, valores?: readonly unknown[]) => {
          comandos.push(texto.trim().split(/\s+/)[0]!.toLowerCase());
          return pool.query(texto, valores);
        },
        release: () => {
          liberado = true;
        },
      }),
    } as unknown as Consultador;
    expect(await criarTokenDoConector(ana, 'via pool', poolFalso)).not.toBeNull();
    expect(comandos[0]).toBe('begin');
    expect(comandos.at(-1)).toBe('commit');
    expect(liberado).toBe(true);
  });

  it('se até o rollback falhar, o cliente volta ao pool como quebrado (release com erro)', async () => {
    // Devolver ao pool uma conexão talvez ainda dentro da transação faria o
    // próximo pedido herdá-la; `release(erro)` manda o `pg` destruí-la.
    let liberadoCom: unknown = 'nunca';
    const poolFalso = {
      query: () => Promise.reject(new Error('fora da transação')),
      connect: async () => ({
        query: (texto: string) =>
          /^\s*begin/i.test(texto)
            ? Promise.resolve({ rows: [] })
            : Promise.reject(new Error(`falhou: ${texto.trim().slice(0, 20)}`)),
        release: (erro?: Error) => {
          liberadoCom = erro;
        },
      }),
    } as unknown as Consultador;
    await expect(criarTokenDoConector(ana, 'x', poolFalso)).rejects.toThrow(/falhou/);
    expect(liberadoCom).toBeInstanceOf(Error);
    expect(String(liberadoCom)).toMatch(/rollback/);
  });

  /*
   * S6, coerência: token morto por inatividade some da listagem e não ocupa
   * vaga — a mesma regra de `pessoaDoToken`. Senão a pessoa veria um endereço
   * que não funciona e não conseguiria criar outro.
   */
  it('token morto por inatividade não aparece nem ocupa vaga', async () => {
    const dono = await garantirPessoa({ googleSub: 'sub-inativo', email: 'inativo@citi.org.br' }, pool);
    const parado = await criar(dono, 'parado', pool);
    await criar(dono, 'a', pool);
    await criar(dono, 'b', pool);
    await pool.query(
      `update token_do_conector set criado_em = now() - interval '200 days', usado_em = now() - interval '100 days' where id = $1`,
      [parado.id],
    );
    expect(await contarTokens(dono, pool)).toBe(2);
    expect((await listarTokens(dono, pool)).map((t) => t.rotulo).sort()).toEqual(['a', 'b']);
    expect(await criarTokenDoConector(dono, 'c', pool)).not.toBeNull();
  });

  it('o token nasce reconhecível e resolve na pessoa', async () => {
    const { token } = await criar(ana, 'Claude no desktop', pool);
    expect(token.startsWith('taqciti_')).toBe(true);
    // 32 bytes em base64url dão 43 caracteres, mais o prefixo.
    expect(token.length).toBe('taqciti_'.length + 43);
    expect(await pessoaDoToken(token, pool)).toBe(ana);
  });

  it('token parado além do prazo de inatividade deixa de valer', async () => {
    const { token, id } = await criar(ana, 'esquecido', pool);
    expect(await pessoaDoToken(token, pool)).toBe(ana);
    // Espera o `usado_em` disparado sem await, para ele não reescrever o envelhecimento abaixo.
    await ateQue(async () => {
      const { rows } = await pool.query('select usado_em from token_do_conector where id = $1', [id]);
      return rows[0]?.usado_em != null;
    });
    await pool.query(
      `update token_do_conector set criado_em = now() - interval '200 days', usado_em = now() - interval '100 days' where id = $1`,
      [id],
    );
    expect(await pessoaDoToken(token, pool)).toBeNull();
  });

  /*
   * S6: prazo ABSOLUTO. A inatividade não segura uma URL vazada que outra
   * pessoa continua usando — ela nunca fica parada. Com `expira_em`, o token
   * morre aos 90 dias mesmo em uso diário.
   */
  it(`o token nasce com prazo de ${DIAS_DE_VALIDADE} dias`, async () => {
    const { id } = await criar(ana, 'prazo', pool);
    const { rows } = await pool.query(
      `select extract(epoch from (expira_em - criado_em)) / 86400 as dias from token_do_conector where id = $1`,
      [id],
    );
    expect(Math.round(Number(rows[0]?.dias))).toBe(DIAS_DE_VALIDADE);
  });

  it('token vencido deixa de valer mesmo usado ontem, e some da listagem', async () => {
    const dono = await garantirPessoa({ googleSub: 'sub-vencido', email: 'vencido@citi.org.br' }, pool);
    const { token, id } = await criar(dono, 'em uso', pool);
    expect(await pessoaDoToken(token, pool)).toBe(dono);
    await ateQue(async () => {
      const { rows } = await pool.query('select usado_em from token_do_conector where id = $1', [id]);
      return rows[0]?.usado_em != null;
    });
    await pool.query(
      `update token_do_conector set usado_em = now() - interval '1 day', expira_em = now() - interval '1 minute' where id = $1`,
      [id],
    );
    expect(await pessoaDoToken(token, pool)).toBeNull();
    expect(await listarTokens(dono, pool)).toEqual([]);
  });

  it(`no máximo ${MAX_TOKENS_ATIVOS} tokens contam; vencido não ocupa vaga e sai ao criar outro`, async () => {
    expect(MAX_TOKENS_ATIVOS).toBe(3);
    const dono = await garantirPessoa({ googleSub: 'sub-teto', email: 'teto@citi.org.br' }, pool);
    const velho = await criar(dono, 'velho', pool);
    await criar(dono, 'a', pool);
    await criar(dono, 'b', pool);
    expect(await contarTokens(dono, pool)).toBe(3);

    await pool.query(`update token_do_conector set expira_em = now() - interval '1 minute' where id = $1`, [velho.id]);
    expect(await contarTokens(dono, pool)).toBe(2);

    await criar(dono, 'c', pool);
    const { rows } = await pool.query('select id from token_do_conector where id = $1', [velho.id]);
    expect(rows).toHaveLength(0);
    const lista = await listarTokens(dono, pool);
    expect(lista.map((t) => t.rotulo).sort()).toEqual(['a', 'b', 'c']);
    expect(lista.every((t) => new Date(t.expiraEm).getTime() > Date.now())).toBe(true);
  });

  it('o token em claro não fica no banco', async () => {
    const { token } = await criar(ana, undefined, pool);
    const { rows } = await pool.query('select hash from token_do_conector');
    const hashes = rows.map((r) => String(r.hash));
    expect(hashes).not.toContain(token);
    expect(hashes).toContain(hashDoToken(token));
  });

  it('dois tokens nunca saem iguais', async () => {
    const a = await criar(ana, undefined, pool);
    const b = await criar(ana, undefined, pool);
    expect(a.token).not.toBe(b.token);
  });

  it('token inventado, vazio ou sem o prefixo devolve null', async () => {
    expect(await pessoaDoToken('taqciti_naoexiste', pool)).toBeNull();
    expect(await pessoaDoToken('', pool)).toBeNull();
    expect(await pessoaDoToken('sem-prefixo-nenhum', pool)).toBeNull();
  });

  it('registra o último uso', async () => {
    const { token, id } = await criar(ana, undefined, pool);
    expect(await pessoaDoToken(token, pool)).toBe(ana);
    const registrou = await ateQue(async () => {
      const { rows } = await pool.query('select usado_em from token_do_conector where id = $1', [
        id,
      ]);
      return rows[0]?.usado_em != null;
    });
    expect(registrou).toBe(true);
  });

  it('revogar derruba o acesso na hora', async () => {
    const { token, id } = await criar(ana, undefined, pool);
    expect(await pessoaDoToken(token, pool)).toBe(ana);

    expect(await revogarToken(ana, id, pool)).toBe(true);
    expect(await pessoaDoToken(token, pool)).toBeNull();
  });

  it('revogar duas vezes não mente na segunda', async () => {
    const { id } = await criar(ana, undefined, pool);
    expect(await revogarToken(ana, id, pool)).toBe(true);
    expect(await revogarToken(ana, id, pool)).toBe(false);
  });

  it('não dá para revogar o token de outra pessoa', async () => {
    const { token, id } = await criar(ana, undefined, pool);
    // A Bia sabe o id — e mesmo assim não derruba.
    expect(await revogarToken(bia, id, pool)).toBe(false);
    expect(await pessoaDoToken(token, pool)).toBe(ana);
  });

  it('a listagem esquece o revogado e nunca mostra o token', async () => {
    const pool2 = pglite as unknown as Consultador;
    const carlos = await garantirPessoa(
      { googleSub: 'sub-carlos', email: 'carlos@citi.org.br' },
      pool2,
    );
    const { token } = await criar(carlos, 'ChatGPT', pool2);
    const { id } = await criar(carlos, 'Claude', pool2);
    await revogarToken(carlos, id, pool2);

    const lista = await listarTokens(carlos, pool2);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.rotulo).toBe('ChatGPT');
    // Nem o token, nem o hash dele, aparecem no que a página vai desenhar.
    const serializado = JSON.stringify(lista);
    expect(serializado).not.toContain(token);
    expect(serializado).not.toContain(hashDoToken(token));
  });

  it('cada pessoa só vê os seus', async () => {
    const daBia = await listarTokens(bia, pool);
    expect(daBia).toEqual([]);
  });

  describe('só a organização usa o conector (o token é conferido contra o e-mail da dona)', () => {
    const guardado = process.env.TAQCITI_DOMINIO_PERMITIDO;
    afterEach(() => {
      if (guardado === undefined) delete process.env.TAQCITI_DOMINIO_PERMITIDO;
      else process.env.TAQCITI_DOMINIO_PERMITIDO = guardado;
    });

    it('um token de quem NÃO é do CITi deixa de funcionar, mesmo já criado antes da regra', async () => {
      const gmail = await garantirPessoa({ googleSub: 'sub-gmail', email: 'alguem@gmail.com' }, pool);
      const { token } = await criar(gmail, undefined, pool);
      expect(await pessoaDoToken(token, pool)).toBeNull();
    });

    it('um e-mail que só termina parecido também não', async () => {
      const falso = await garantirPessoa({ googleSub: 'sub-falso', email: 'x@naoehciti.org.br' }, pool);
      const { token } = await criar(falso, undefined, pool);
      expect(await pessoaDoToken(token, pool)).toBeNull();
    });

    it('quem é do CITi continua entrando', async () => {
      const { token } = await criar(ana, undefined, pool);
      expect(await pessoaDoToken(token, pool)).toBe(ana);
    });

    it('a conta que mudou de e-mail para fora da organização perde o acesso na hora', async () => {
      const mudou = await garantirPessoa({ googleSub: 'sub-mudou', email: 'mudou@citi.org.br' }, pool);
      const { token } = await criar(mudou, undefined, pool);
      expect(await pessoaDoToken(token, pool)).toBe(mudou);
      await garantirPessoa({ googleSub: 'sub-mudou', email: 'mudou@gmail.com' }, pool);
      expect(await pessoaDoToken(token, pool)).toBeNull();
    });

    it('com a restrição desligada de propósito (*), o token de fora volta a valer', async () => {
      process.env.TAQCITI_DOMINIO_PERMITIDO = '*';
      const gmail = await garantirPessoa({ googleSub: 'sub-gmail', email: 'alguem@gmail.com' }, pool);
      const { token } = await criar(gmail, undefined, pool);
      expect(await pessoaDoToken(token, pool)).toBe(gmail);
    });
  });
});
