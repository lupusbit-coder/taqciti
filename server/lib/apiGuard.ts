/**
 * Tranca mínima do endpoint. NÃO é autenticação de verdade — é uma tranca
 * contra uso acidental e varredura.
 *
 * Enquanto /api/generate devolvia stub, o CORS permissivo era risco aceito e
 * documentado. A partir do momento em que existe uma chave de API atrás da
 * rota, cada requisição custa dinheiro e qualquer um que descubra a URL
 * gasta a cota de outra pessoa. O que atende ou recusa é o SEGREDO
 * COMPARTILHADO (`rejectIfUnauthorized`), somado ao teto de
 * `maxTranscriptChars` — nunca o CORS. O CORS (só a extensão, desde 11/2026)
 * impede apenas que uma página web use o navegador de quem a visita; ver
 * `corsHeaders`.
 *
 * Limite honesto: o segredo viaja dentro do bundle da extensão, então quem
 * abrir o pacote acha. Isso é aceitável para o que ele defende — impedir que
 * um scanner ou uma extensão qualquer torre a cota — e não para tratar o
 * chamador como confiável. Autenticação real (por usuário, com rotação)
 * continua sendo trabalho de uma fase futura.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { emProducao } from './ai/config';

export const SHARED_KEY_HEADER = 'x-docciti-key';

/** Teto por requisição. Transcrição acima disso é recusada com erro claro,
 *  em vez de virar uma conta cara e uma espera longa. */
const DEFAULT_MAX_TRANSCRIPT_CHARS = 400_000;

export function maxTranscriptChars(): number {
  const raw = process.env.DOCCITI_MAX_TRANSCRIPT_CHARS;
  if (!raw?.trim()) return DEFAULT_MAX_TRANSCRIPT_CHARS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `DOCCITI_MAX_TRANSCRIPT_CHARS="${raw}" precisa ser um inteiro positivo de caracteres.`,
    );
  }
  return parsed;
}

/** Comparação de tempo constante, pra não vazar o segredo byte a byte. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes vaza só o
  // comprimento, que não é o segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Variável que restringe o CORS a origens exatas, separadas por vírgula
 * (tipicamente `chrome-extension://<id da extensão publicada>`). O valor real
 * fica só no painel do host: este repositório é público.
 */
export const ORIGENS_PERMITIDAS_ENV = 'DOCCITI_ORIGENS_PERMITIDAS';

/** Origem de uma extensão do Chrome/Edge: o id tem 32 letras de `a` a `p`. */
const ORIGEM_DE_EXTENSAO = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * A origem pode ler a resposta? Com `DOCCITI_ORIGENS_PERMITIDAS` definida, só
 * as origens listadas. Sem ela, qualquer origem `chrome-extension://` — o
 * padrão que não quebra o desenvolvimento local nem o `dist-dev`, cujo id
 * (unpacked) difere do da loja e muda de máquina para máquina.
 */
function origemPermitida(origin: string): boolean {
  const lista = (process.env[ORIGENS_PERMITIDAS_ENV] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (lista.length > 0) return lista.includes(origin);
  return ORIGEM_DE_EXTENSAO.test(origin);
}

/**
 * Só a extensão lê a resposta; página web nenhuma.
 *
 * Até 11/2026 esta função refletia QUALQUER origem, porque o painel era um
 * content script em `<all_urls>`, e um `fetch` de content script carrega a
 * origem da PÁGINA: uma lista de origens precisaria conter a internet, e
 * tentativas anteriores (só `chrome-extension://`; depois também o Meet)
 * quebraram a geração de documento. Isso deixou de valer: o content script
 * foi reduzido ao Meet (21/10/2026, plano de segurança), e quem chama o
 * servidor hoje são só páginas da extensão (Home, sidebar) e o service
 * worker — todos com origem `chrome-extension://<id>`. O content script do
 * Meet não chama o servidor.
 *
 * O que isto passa a defender: uma página web usando o navegador de quem a
 * visita para chamar o servidor. Toda rota que gasta ou identifica exige um
 * header próprio (`x-docciti-key` ou `Authorization`), o que obriga preflight;
 * sem `Access-Control-Allow-Origin` no preflight, o navegador nem envia o POST.
 *
 * O que continua igual: requisição SEM `Origin` (curl, servidor, teste) segue
 * para o handler sem cabeçalho de origem — CORS é regra do navegador, e quem
 * recusa esses chamadores é a autenticação (`autorizarIa`,
 * `rejectIfUnauthorized`), nunca o CORS.
 *
 * Origem recusada não vira 403: a rota responde normalmente, só sem
 * `Access-Control-Allow-Origin`, e o navegador bloqueia a leitura. Recusar no
 * servidor quebraria um chamador legítimo cuja origem não previmos sem
 * proteger nada a mais, já que a autenticação é que decide.
 *
 * Sem `Access-Control-Allow-Credentials` de propósito: não há cookie nem
 * sessão nestas rotas.
 */
export function corsHeaders(
  origin: string | null,
  /**
   * Os métodos que a rota aceita. O padrão cobre as rotas de geração, que só
   * fazem POST; as rotas do conector listam e revogam, e precisam dizer isso
   * no preflight — um método fora desta lista é bloqueado pelo navegador
   * antes de a requisição sair, e o handler nunca chega a ser chamado.
   */
  metodos = 'POST, OPTIONS',
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': metodos,
    // `Authorization` entra porque é por ele que o token do Google chega nas
    // rotas de identidade. Ver `lib/identidade/rota.ts`.
    'Access-Control-Allow-Headers': `Content-Type, Authorization, ${SHARED_KEY_HEADER}`,
    Vary: 'Origin',
  };
  if (origin && origemPermitida(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/**
 * As rotas de diagnóstico (`/api/ai/bench`, `/smoke`, `/secao`) não existem em
 * produção.
 *
 * Elas servem a quem desenvolve: escolhem modelo e provedor pelo corpo, rodam
 * a apuração completa ou todos os provedores de uma vez. Atrás do segredo
 * compartilhado — que está no bundle — eram um jeito de qualquer um escolher o
 * modelo mais caro e multiplicar a conta. A extensão não chama nenhuma delas.
 *
 * `DOCCITI_DIAGNOSTICO=ligado` reabre, para uma verificação pontual pós-deploy;
 * a variável deve voltar a sair logo depois.
 */
export function diagnosticoForaDoAr(headers: Record<string, string>): NextResponse | null {
  const producao = emProducao();
  const liberado = process.env.DOCCITI_DIAGNOSTICO?.trim().toLowerCase() === 'ligado';
  if (producao && !liberado) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404, headers });
  }
  return null;
}

/**
 * Devolve uma resposta de erro quando a requisição não passa, e `null`
 * quando passa. Falha FECHADA se o segredo não estiver configurado: com
 * chave de API atrás da rota, "sem segredo definido" não pode significar
 * "aberto pra todo mundo".
 */
export function rejectIfUnauthorized(
  request: NextRequest,
  headers: Record<string, string>,
): NextResponse | null {
  const expected = process.env.DOCCITI_SHARED_KEY?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          'Servidor sem DOCCITI_SHARED_KEY configurada. Defina-a em server/.env.local ' +
          '(ver server/.env.example) antes de usar esta rota.',
      },
      { status: 500, headers },
    );
  }

  const provided = request.headers.get(SHARED_KEY_HEADER);
  if (!provided || !secretsMatch(provided, expected)) {
    return NextResponse.json(
      { error: `Header ${SHARED_KEY_HEADER} ausente ou inválido.` },
      { status: 401, headers },
    );
  }

  return null;
}
