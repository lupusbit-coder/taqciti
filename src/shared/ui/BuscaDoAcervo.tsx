/** Busca local compartilhada: não envia o acervo à IA e não modifica registros. */
import { useState } from 'react';

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function correspondeABusca(consulta: string, textos: readonly (string | undefined | null)[]): boolean {
  const alvo = normalizarBusca(textos.filter(Boolean).join(' '));
  return normalizarBusca(consulta).trim().split(/\s+/).every((termo) => alvo.includes(termo));
}

export function dentroDoPeriodo(instante: number, de: string, ate: string): boolean {
  const data = new Date(instante);
  const dia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  return (!de || dia >= de) && (!ate || dia <= ate);
}

export function useBuscaDoAcervo() {
  const [consulta, setConsulta] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  return { consulta, setConsulta, de, setDe, ate, setAte };
}

export function BuscaDoAcervo({ busca, rotulo, total, datas = true }: {
  busca: ReturnType<typeof useBuscaDoAcervo>; rotulo: string; total: number; datas?: boolean;
}) {
  return <div className="tq-busca-acervo" role="search" aria-label={rotulo}>
    <label>{rotulo}<input type="search" value={busca.consulta}
      onChange={(e) => busca.setConsulta(e.target.value)} placeholder="Nome ou conteúdo" /></label>
    {datas && <>
      <label>De<input type="date" value={busca.de} onChange={(e) => busca.setDe(e.target.value)} /></label>
      <label>Até<input type="date" value={busca.ate} onChange={(e) => busca.setAte(e.target.value)} /></label>
    </>}
    <span role="status">{total} {total === 1 ? 'resultado' : 'resultados'}</span>
    {(busca.consulta || busca.de || busca.ate) && <button type="button" className="tq-acao" onClick={() => {
      busca.setConsulta(''); busca.setDe(''); busca.setAte('');
    }}>Limpar busca</button>}
  </div>;
}
