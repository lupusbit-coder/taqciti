/**
 * A página "Preparar" abre com a grade de contextos. As ações da grade são
 * cobertas em `OQueLevar.test.tsx`.
 *
 * Seguram: a página não prepara uma reunião específica (23/10/2026); e não tem
 * mais "Ajustes sugeridos" nem "Testar o assistente numa reunião passada"
 * (23/11/2026): com o assistente sempre "só quando eu chamar", não há sugestão
 * automática para dar retorno nem para reproduzir.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { installChromeStorageMock } from '@/test/chromeStorageMock';
import { salvarPerfil } from '@/features/conducao/store';
import { PaginaPreparar } from './Preparar';

let host: HTMLDivElement;
let root: Root;

const esperar = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)));
};

async function montar() {
  await act(async () => root.render(<PaginaPreparar />));
  await esperar(() => host.querySelector('#tq-prep-perfil') !== null);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installChromeStorageMock();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('abre com a grade e deixa a personalização recolhida', async () => {
  await montar();
  expect(host.querySelector('.tq-contextos-grade button')?.textContent).toBe('Adicionar contexto');
  expect(host.querySelector('.tq-ed')).toBeNull();
  expect(host.querySelector('[aria-label="Ajustes do assistente"]')?.getAttribute('aria-expanded')).toBe('false');
});

/*
 * 23/10/2026: o Preparar é 100% válido para todas as reuniões. Não há mais
 * escolher uma reunião para preparar (objetivo, prioridades, retomar) nem o
 * custo do apoio por reunião.
 */
it('não prepara uma reunião específica: nada de seletor de reunião nem briefing', async () => {
  await montar();
  expect(host.textContent).not.toContain('Preparar uma reunião');
  expect(host.textContent).not.toContain('Salvar a preparação');
  expect(host.textContent).not.toContain('Escolha uma reunião');
  expect(host.querySelector('[data-testid="custo-do-apoio"]')).toBeNull();
});

// 23/11/2026: saíram com o modo fixo em "só quando eu chamar", mesmo com perfil salvo.
it('não tem "Ajustes sugeridos" nem "Testar o assistente numa reunião passada"', async () => {
  await salvarPerfil({ base: 'personalizado', contextos: [{ nome: 'A', texto: 'a', vaga: 0 }] }, 0);
  await montar();
  expect(host.textContent).not.toContain('Ajustes sugeridos');
  expect(host.textContent).not.toContain('Testar o assistente numa reunião passada');
  expect(host.textContent).not.toContain('Reproduzir');
});
