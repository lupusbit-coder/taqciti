import { beforeEach, expect, it, vi } from 'vitest';
import { installChromeStorageMock } from '@/test/chromeStorageMock';
import { salvarPerfil, fixarPerfilDaReuniao } from '@/features/conducao/store';
import { criarOrquestrador, criarRegistroPadrao } from './orquestrador';
import { armazenamentoLocal } from './armazenamento';
import { estadoDoTaqSchema, type AdaptadorHttp } from './modelo';

beforeEach(() => {
  installChromeStorageMock();
});
const perfil = (permitida: boolean) => ({
  base: 'personalizado' as const,
  contextos: [],
  buscaNaInternet: permitida,
});
const pesquisaWeb = {
  fontes: [{ titulo: 'Fonte pública', url: 'https://example.org/' }],
  sugestoesHtml: '<div>Pesquisa</div>',
};

function modelo(disponivel: boolean): AdaptadorHttp {
  return {
    estado: vi.fn<AdaptadorHttp['estado']>(async () => ({
      pronto: true,
      provedor: 'google',
      modelo: 'gemini-3.5-flash',
      instrucoesVersao: 'taq-v7',
      politicaDeDados: 'private',
      pendencias: [],
      buscaNaInternet: { disponivel, motivo: '' },
    })),
    turno: vi.fn<AdaptadorHttp['turno']>(async (p) => ({
      tipo: 'final',
      texto: 'Resposta pública.',
      chamadas: [],
      uso: { entrada: 1, saida: 1 },
      provedor: 'google',
      modelo: 'gemini-3.5-flash',
      instrucoesVersao: p.instrucoes,
      latenciaMs: 1,
      ...(p.buscaNaInternet ? { pesquisaWeb } : {}),
    })),
  };
}
const pedido = {
  conversaId: 'c-busca',
  texto: 'Pesquise na internet informações públicas sobre acessibilidade.',
  anteriores: [],
  selecionados: [],
};

it.each([
  [false, true],
  [true, false],
  [true, true],
])(
  'exige permissão do perfil (%s) e liberação do servidor (%s)',
  async (permitida, disponivel) => {
    await salvarPerfil(perfil(permitida), 0);
    const adaptador = modelo(disponivel);
    const r = await criarOrquestrador({
      modelo: adaptador,
      armazenamento: armazenamentoLocal,
      agentes: criarRegistroPadrao({ especialistas: false }),
    }).executar(pedido);
    const chamada = vi.mocked(adaptador.turno).mock.calls[0]?.[0];
    expect(chamada?.buscaNaInternet === true).toBe(permitida && disponivel);
    expect(chamada?.instrucoes).toBe(permitida && disponivel ? 'taq-v8' : 'taq-v7');
    expect(r.pesquisasWeb).toEqual(permitida && disponivel ? [pesquisaWeb] : undefined);
    expect(r.evidencias).toEqual([]);
    if (!permitida) expect(adaptador.estado).not.toHaveBeenCalled();
  },
);

it('respeita a preferência fixada no início da reunião', async () => {
  await salvarPerfil(perfil(false), 0);
  await fixarPerfilDaReuniao('m1');
  await salvarPerfil(perfil(true), 1);
  const adaptador = modelo(true);
  await criarOrquestrador({
    modelo: adaptador,
    armazenamento: armazenamentoLocal,
  }).executar({ ...pedido, meetingId: 'm1' });
  expect(vi.mocked(adaptador.turno).mock.calls[0]?.[0]?.buscaNaInternet).toBeUndefined();
  expect(adaptador.estado).not.toHaveBeenCalled();
});

it('continua compatível com servidor anterior, sem anunciar busca disponível', () => {
  const estado = estadoDoTaqSchema.parse({
    pronto: true,
    provedor: 'google',
    modelo: 'gemini-3.5-flash',
    instrucoesVersao: 'taq-v7',
    politicaDeDados: 'private',
    pendencias: [],
  });
  expect(estado.buscaNaInternet).toBeUndefined();
});
