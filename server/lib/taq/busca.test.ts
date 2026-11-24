import { describe, expect, it, vi } from 'vitest';
import { atenderTurno } from './atender';
import { resolverConfiguracao, estadoPublico } from './config';
import { fontesDaBusca } from './busca';
import { criarAdaptadorGemini, type ClienteGemini } from './gemini';

const env: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  GOOGLE_API_KEY: 'somente-teste',
  // A busca é do Gemini; o padrão do Taq virou Anthropic em 23/11/2026.
  TAQ_ORQUESTRADOR: 'google:gemini-3.5-flash',
  DOCCITI_DATA_POLICY: 'private',
};
const pedido = {
  instrucoes: 'taq-v8',
  mensagens: [{ papel: 'pessoa', texto: 'Pesquise informações públicas.' }],
  maxTokensDeSaida: 512,
  buscaNaInternet: true,
};

describe('liberação da busca sem chamadas ao provedor', () => {
  it.each([undefined, 'desligada', 'true', 'sim'])(
    'fica desligada por padrão ou valor não explícito: %s',
    (valor) => {
      const c = resolverConfiguracao({ ...env, TAQ_BUSCA_NA_INTERNET: valor });
      expect(estadoPublico(c).buscaNaInternet.disponivel).toBe(false);
      expect(JSON.stringify(estadoPublico(c))).not.toContain('somente-teste');
    },
  );
  it.each([
    { GOOGLE_API_KEY: '' },
    { DOCCITI_DATA_POLICY: 'training' },
    { TAQ_ORQUESTRADOR: 'groq:llama', GROQ_API_KEY: 'teste' },
    { TAQ_ORQUESTRADOR: 'google:gemini-2.5-flash' },
  ])('não libera sem chave, política ou modelo compatível: %j', (variacao) => {
    expect(
      resolverConfiguracao({ ...env, TAQ_BUSCA_NA_INTERNET: 'ligada', ...variacao })
        .buscaNaInternet.disponivel,
    ).toBe(false);
  });
  it('recusa a tentativa do cliente antes de chamar o provedor', async () => {
    const executar = vi.fn();
    const resultado = await atenderTurno(pedido, {
      env,
      adaptadores: { google: { provedor: 'google', executar } },
    });
    expect(resultado.status).toBe(503);
    expect(executar).not.toHaveBeenCalled();
  });
  it('só oferece Google Search quando há permissão dos dois lados', async () => {
    const generateContent = vi.fn<ClienteGemini['models']['generateContent']>(
      async () => ({
        candidates: [{ content: { parts: [{ text: 'Resposta pública.' }] } }],
      }),
    );
    const adaptador = criarAdaptadorGemini(() => ({ models: { generateContent } }));
    const deps = {
      env: { ...env, TAQ_BUSCA_NA_INTERNET: 'ligada' },
      adaptadores: { google: adaptador },
    };
    expect((await atenderTurno({ ...pedido, buscaNaInternet: false }, deps)).status).toBe(
      200,
    );
    expect(generateContent.mock.calls[0]?.[0]?.config.tools).toBeUndefined();
    expect(
      (
        await atenderTurno(
          {
            ...pedido,
            ferramentas: [
              {
                nome: 'search_records',
                descricao: 'Registros locais',
                parametros: { type: 'object' },
              },
            ],
          },
          deps,
        )
      ).status,
    ).toBe(200);
    expect(generateContent.mock.calls[1]?.[0]?.config.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'search_records',
            description: 'Registros locais',
            parametersJsonSchema: { type: 'object' },
          },
        ],
      },
      { googleSearch: {} },
    ]);
  });
});

describe('fontes do provedor', () => {
  it('respeita os índices por parte sem exibir nem contar o raciocínio', () => {
    const r = fontesDaBusca(
      'Introdução. Informação.',
      {
        groundingChunks: [{ web: { uri: 'https://example.org' } }],
        groundingSupports: [
          {
            segment: {
              partIndex: 2,
              startIndex: 0,
              endIndex: Buffer.byteLength('Informação.'),
              text: 'Informação.',
            },
            groundingChunkIndices: [0],
          },
        ],
      },
      [
        { thought: true, text: 'Privado' },
        { text: 'Introdução. ' },
        { text: 'Informação.' },
      ],
    );
    expect(r.texto).toBe('Introdução. Informação. [web 1](https://example.org/)');
  });
  it('cita no trecho certo, contando acentos em bytes, e preserva as sugestões', () => {
    const texto = 'A reunião é hoje. Fim.';
    const trecho = 'A reunião é hoje.';
    const r = fontesDaBusca(texto, {
      groundingChunks: [{ web: { uri: 'https://example.org/a(b)', title: 'Fonte' } }],
      groundingSupports: [
        {
          segment: { startIndex: 0, endIndex: Buffer.byteLength(trecho), text: trecho },
          groundingChunkIndices: [0, 0],
        },
      ],
      searchEntryPoint: { renderedContent: '<div>Sugestões</div>' },
    });
    expect(r.texto).toBe('A reunião é hoje. [web 1](https://example.org/a%28b%29) Fim.');
    expect(r.pesquisaWeb?.sugestoesHtml).toBe('<div>Sugestões</div>');
  });
  it('descarta links inseguros e não inventa citações quando o trecho não confere', () => {
    const r = fontesDaBusca('Texto', {
      groundingChunks: [
        { web: { uri: 'javascript:alert(1)' } },
        { web: { uri: 'https://senha:secreta@example.org' } },
        { web: { uri: 'https://example.org', title: 'Fonte' } },
      ],
      groundingSupports: [
        { segment: { endIndex: 5, text: 'Outro' }, groundingChunkIndices: [2] },
      ],
    });
    expect(r.texto).toBe('Texto');
    expect(r.pesquisaWeb?.fontes).toEqual([
      { titulo: 'Fonte', url: 'https://example.org/' },
    ]);
  });
});
