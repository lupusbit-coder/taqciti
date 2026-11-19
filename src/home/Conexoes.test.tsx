/**
 * Conexões: o endereço do conector aparece na tela depois de gerado.
 *
 * O defeito (varredura de 11/11/2026, `verify-estados.cjs`): o tile do Claude
 * só existe enquanto o Claude NÃO tem endereço. Gerar recarrega a lista do
 * servidor, que já traz o endereço novo — e o tile sumia levando junto o
 * `EnderecoNovo`. O endereço, que só existe naquela resposta, nunca era
 * mostrado. A identidade e o servidor são simulados: o que se observa é a tela.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installChromeStorageMock } from '@/test/chromeStorageMock';

const tokens: Array<{ id: string; rotulo: string | null; criadoEm: string; usadoEm: string | null }> = [];

vi.mock('@/shared/services/identidade', () => ({
  estadoDaSincronizacao: vi.fn(async () => ({ situacao: 'ligada', email: 'pessoa.teste@citi.org.br' })),
  estadoDoLogin: vi.fn(async () => ({ situacao: 'dentro', email: 'pessoa.teste@citi.org.br', pelaSincronizacao: true })),
  ligarSincronizacao: vi.fn(),
  desligarSincronizacao: vi.fn(),
  entrarParaIa: vi.fn(),
  sairDaIa: vi.fn(),
}));

vi.mock('@/shared/services/conector', () => ({
  ConectorIndisponivel: class extends Error {},
  listarTokensDoConector: vi.fn(async () => ({ email: 'pessoa.teste@citi.org.br', tokens: [...tokens] })),
  criarTokenDoConector: vi.fn(async (rotulo?: string) => {
    tokens.push({ id: 't-1', rotulo: rotulo ?? null, criadoEm: '2026-11-11T12:00:00Z', usadoEm: null });
    return { id: 't-1', token: 'teste', url: 'https://servidor.invalid/mcp/t-1' };
  }),
  revogarTokenDoConector: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;

const botoes = (texto: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === texto);
const esperar = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)));
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  tokens.length = 0;
  installChromeStorageMock();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('o endereço recém-gerado para o Claude aparece, mesmo com a lista já trazendo o Claude', async () => {
  const { PaginaConexoes } = await import('./Conexoes');
  await act(async () => root.render(<PaginaConexoes registros={[]} />));
  await esperar(() => botoes('Conectar').length > 0);

  const tile = [...host.querySelectorAll('.tq-hub-tile')].find((t) => t.textContent?.includes('Claude'))!;
  await act(async () => tile.querySelector('button')!.click());
  await act(async () => botoes('Gerar endereço')[0]!.click());
  await esperar(() => host.querySelector('.tq-conector-novo') !== null);

  const campo = host.querySelector<HTMLInputElement>('.tq-conector-novo input');
  expect(campo?.value).toBe('https://servidor.invalid/mcp/t-1');
  // E a lista de conectadas já mostra o endereço do Claude.
  const conectadas = [...host.querySelectorAll('.tq-hub-lista')].at(-1)!;
  expect(conectadas.textContent).toContain('Claude');
});
