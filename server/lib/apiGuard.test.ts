/**
 * O CORS destas rotas já quebrou o produto duas vezes, das duas por restringir
 * origem enquanto o painel era content script em `<all_urls>` (content script
 * manda a origem da PÁGINA):
 *
 *   1. só `chrome-extension://` — nada gerava documento;
 *   2. `chrome-extension://` + `https://meet.google.com` — gerava na aba do Meet
 *      e falhava em todas as outras.
 *
 * Por isso a função passou um tempo refletindo qualquer origem. Desde 11/2026
 * ela volta a restringir, porque o motivo sumiu: o content script ficou só no
 * Meet e não chama o servidor; quem chama são páginas da extensão e o service
 * worker, com origem `chrome-extension://<id>`. Se um dia o content script
 * voltar a chamar o servidor, ESTE arquivo precisa mudar junto — o navegador
 * bloqueia antes de sair, e a extensão só vê um `fetch` que lança.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corsHeaders, ORIGENS_PERMITIDAS_ENV, SHARED_KEY_HEADER } from './apiGuard';

const ORIGEM = 'Access-Control-Allow-Origin';
// Ids inventados, no formato de id de extensão (32 letras de a a p).
const EXTENSAO = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const OUTRA_EXTENSAO = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('corsHeaders — sem a variável de origens', () => {
  it('reflete a origem de uma página da extensão (dev local, dist-dev e loja)', () => {
    vi.stubEnv(ORIGENS_PERMITIDAS_ENV, '');
    expect(corsHeaders(EXTENSAO)[ORIGEM]).toBe(EXTENSAO);
    expect(corsHeaders(OUTRA_EXTENSAO)[ORIGEM]).toBe(OUTRA_EXTENSAO);
  });

  /*
   * A DECISÃO. Página web não lê resposta do servidor: sem o cabeçalho, o
   * preflight falha e o navegador nem envia o POST (todas as rotas pedem um
   * header próprio). Isto inclui o Meet: o content script de lá não chama o
   * servidor, então não há motivo para o Meet ler resposta.
   */
  it.each([
    'https://meet.google.com',
    'https://github.com',
    'http://localhost:5173',
    'https://exemplo.com',
    'chrome-extension://curto',
    `${EXTENSAO}.exemplo.com`,
    'null',
  ])('não reflete %s', (origem) => {
    vi.stubEnv(ORIGENS_PERMITIDAS_ENV, '');
    expect(corsHeaders(origem)).not.toHaveProperty(ORIGEM);
  });
});

describe('corsHeaders — com DOCCITI_ORIGENS_PERMITIDAS', () => {
  it('só as origens listadas, comparadas por igualdade exata', () => {
    vi.stubEnv(ORIGENS_PERMITIDAS_ENV, ` ${EXTENSAO} , http://localhost:5173`);
    expect(corsHeaders(EXTENSAO)[ORIGEM]).toBe(EXTENSAO);
    expect(corsHeaders('http://localhost:5173')[ORIGEM]).toBe('http://localhost:5173');
    // Outra extensão instalada no mesmo navegador deixa de ler a resposta.
    expect(corsHeaders(OUTRA_EXTENSAO)).not.toHaveProperty(ORIGEM);
    expect(corsHeaders('https://exemplo.com')).not.toHaveProperty(ORIGEM);
  });
});

describe('corsHeaders — invariantes', () => {
  it('não inventa origem quando a requisição não manda nenhuma', () => {
    // `curl` sem `Origin` segue para o handler; quem o recusa é a
    // autenticação, não o CORS (nem teria como ser).
    expect(corsHeaders(null)).not.toHaveProperty(ORIGEM);
    expect(corsHeaders('')).not.toHaveProperty(ORIGEM);
  });

  it('nunca manda Allow-Credentials', () => {
    // Não há cookie nem sessão nestas rotas.
    expect(corsHeaders(EXTENSAO)).not.toHaveProperty('Access-Control-Allow-Credentials');
  });

  it('declara Vary: Origin e o header do segredo, com ou sem origem', () => {
    for (const headers of [corsHeaders(null), corsHeaders(EXTENSAO), corsHeaders('https://exemplo.com')]) {
      expect(headers['Vary']).toBe('Origin');
      expect(headers['Access-Control-Allow-Headers']).toContain(SHARED_KEY_HEADER);
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    }
  });
});
