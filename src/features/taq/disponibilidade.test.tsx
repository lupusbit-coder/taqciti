import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { _definirTaq, useDisponibilidadeDoTaq } from './interface';
import type { EstadoDoTaq } from './modelo';

afterEach(() => {
  _definirTaq({ adaptador: null, orquestrador: null });
  vi.restoreAllMocks();
});

it('reconhece a configuração do novo deploy ao voltar à janela, sem chamar o modelo', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const estado = vi
    .fn<() => Promise<EstadoDoTaq>>()
    .mockResolvedValueOnce({
      pronto: true,
      provedor: 'google',
      modelo: 'gemini-3.5-flash',
      instrucoesVersao: 'taq-v7',
      politicaDeDados: 'training',
      pendencias: [],
    })
    .mockResolvedValue({
      pronto: true,
      provedor: 'google',
      modelo: 'gemini-3.5-flash',
      instrucoesVersao: 'taq-v7',
      politicaDeDados: 'private',
      pendencias: [],
      buscaNaInternet: { disponivel: true, motivo: '' },
    });
  const turno = vi.fn();
  _definirTaq({ adaptador: { estado, turno } });
  function Tela() {
    const [e] = useDisponibilidadeDoTaq();
    return <p>{e.fase}</p>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<Tela />);
    });
    expect(host.textContent).toBe('pendente');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(host.textContent).toBe('pronto');
    expect(turno).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
  window.dispatchEvent(new Event('focus'));
  expect(estado).toHaveBeenCalledTimes(2);
});
