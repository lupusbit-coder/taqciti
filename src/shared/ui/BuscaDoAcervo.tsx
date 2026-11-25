/**
 * Busca local compartilhada (Reuniões, Documentos e o menu de Conversas): não
 * envia o acervo à IA e não modifica registros.
 *
 * Um campo só. As datas De/Até saíram em 23/11/2026 (pedido do usuário):
 * Reuniões e Documentos buscam só pelo NOME e listam da mais recente para a
 * mais antiga — a data ordena, não filtra. Quem chama decide em que texto
 * procurar (Conversas ainda procura também nas mensagens).
 */
import { useState } from 'react';

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function correspondeABusca(consulta: string, textos: readonly (string | undefined | null)[]): boolean {
  const alvo = normalizarBusca(textos.filter(Boolean).join(' '));
  return normalizarBusca(consulta).trim().split(/\s+/).every((termo) => alvo.includes(termo));
}

/** Os itens cujo NOME casa com a busca, do mais recente para o mais antigo. */
export function porNomeMaisRecentes<T>(itens: readonly T[], consulta: string, nome: (i: T) => string, quando: (i: T) => number): T[] {
  return itens.filter((i) => correspondeABusca(consulta, [nome(i)])).sort((a, b) => quando(b) - quando(a));
}

export function useBuscaDoAcervo() {
  const [consulta, setConsulta] = useState('');
  return { consulta, setConsulta };
}

export function BuscaDoAcervo({ busca, rotulo, total, placeholder = 'Nome' }: {
  busca: ReturnType<typeof useBuscaDoAcervo>; rotulo: string; total: number; placeholder?: string;
}) {
  return <div className="tq-busca-acervo" role="search" aria-label={rotulo}>
    <label>{rotulo}<input type="search" value={busca.consulta} autoComplete="off" spellCheck={false}
      onChange={(e) => busca.setConsulta(e.target.value)}
      onKeyDown={(e) => {
        // Esc limpa só quando há o que limpar; vazio, segue adiante (fecha menu etc.).
        if (e.key === 'Escape' && busca.consulta) { e.preventDefault(); e.stopPropagation(); busca.setConsulta(''); }
      }}
      placeholder={placeholder} /></label>
    <span role="status">{total} {total === 1 ? 'resultado' : 'resultados'}</span>
    {busca.consulta && <button type="button" className="tq-acao" onClick={() => busca.setConsulta('')}>Limpar busca</button>}
  </div>;
}
