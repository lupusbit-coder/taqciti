/** Preferências individuais junto das reuniões; falhas ficam consultáveis, sem bloquear captura. */
import { useEffect, useState } from 'react';
import { lerPreferencias, salvarPreferencias, observarFila, tentarAutomacaoNovamente,
  type PreferenciasDeAutomacao, type ExecucaoAutomatica } from '@/features/automacoes/automacoes';

const ESTADOS = { pendente: 'Na fila', executando: 'Processando', concluida: 'Concluída', falhou: 'Não concluída', cancelada: 'Cancelada' };
export function Automacoes() {
  const [preferencias, setPreferencias] = useState<PreferenciasDeAutomacao | null>(null);
  const [fila, setFila] = useState<ExecucaoAutomatica[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    void lerPreferencias().then(setPreferencias).catch(() => setErro('Não foi possível ler as automações.'));
    return observarFila(setFila);
  }, []);
  function alterar(p: PreferenciasDeAutomacao) {
    setSalvando(true); setErro('');
    void salvarPreferencias(p).then(() => setPreferencias(p))
      .catch(() => setErro('Não foi possível salvar a preferência.')).finally(() => setSalvando(false));
  }
  return <details className="tq-opcoes-acervo">
    <summary>Automações após reuniões</summary>
    <p>Ao encerrar ou importar uma reunião, use a IA para preparar os resultados selecionados. O processamento ocorre com o navegador aberto. Não envia mensagens.</p>
    {preferencias && <div className="tq-acoes">
      <label><input type="checkbox" checked={preferencias.resumo} disabled={salvando}
        onChange={(e) => alterar({ ...preferencias, resumo: e.target.checked })} /> Salvar resumo em Documentos</label>
      <label><input type="checkbox" checked={preferencias.compromissos} disabled={salvando}
        onChange={(e) => alterar({ ...preferencias, compromissos: e.target.checked })} /> Sugerir próximos passos em Acompanhamento</label>
    </div>}
    <p>As opções valem para novas reuniões e importações. Os próximos passos ficam como candidatos, para revisão.</p>
    {fila.length > 0 && <ul>{[...fila].reverse().slice(0, 10).map((e) => <li key={e.id}>
      <strong>{e.titulo}</strong> — {ESTADOS[e.estado]}{e.mensagem && <span> · {e.mensagem}</span>}
      {e.estado === 'falhou' && <button type="button" className="tq-acao" onClick={() => {
        void tentarAutomacaoNovamente(e.id).catch(() => setErro('Não foi possível tentar novamente.'));
      }}>Tentar novamente</button>}
    </li>)}</ul>}
    {erro && <p role="alert">{erro}</p>}
  </details>;
}
