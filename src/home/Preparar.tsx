/**
 * A página "Preparar" da HOME: o assistente que vai para TODAS as reuniões.
 *
 * ── Uma configuração, nenhuma reunião específica ──────────────────────────
 *
 * A grade dá acesso aos contextos e abre a personalização sob demanda em
 * `OQueLevar.tsx`. Nada é salvo até "Usar este assistente".
 *
 * Até 23/10/2026 a página também preparava UMA reunião (objetivo, o que não
 * pode ficar sem encaminhamento, encontros a retomar). Saiu a pedido do
 * usuário: tudo aqui vale igual para todas as reuniões. O briefing guardado
 * antes continua no storage e indo ao modelo para a reunião dele
 * (`features/conducao/contexto.ts`); só não se cria mais por aqui.
 *
 * Até 23/11/2026 havia ainda "Ajustes sugeridos" (o retorno dado às sugestões
 * automáticas virava proposta de ajuste) e "Testar o assistente numa reunião
 * passada" (reproduzia as sugestões automáticas). Com o assistente sempre "só
 * quando eu chamar" (topo de `features/conducao/store.ts`), não há sugestão
 * automática para dar retorno nem para reproduzir: os dois saíram, com o código
 * de `features/calibracao/`, a pedido do usuário.
 */
import { useEffect, useState } from 'react';
import { observarConducao, type Conducao } from '@/features/conducao/store';
import type { MeetingState } from '@/shared/types/domain';
import { MarcaDoTaq } from '@/shared/ui/MarcaDoTaq';
import { OQueLevar, type ReuniaoEmAndamento } from './OQueLevar';

function useConducao(): { conducao: Conducao; carregada: boolean } {
  const [estado, setEstado] = useState<{ conducao: Conducao; carregada: boolean }>({
    conducao: { versao: 2, perfil: null, briefings: [], emUso: [] },
    carregada: false,
  });
  useEffect(() => observarConducao((conducao) => setEstado({ conducao, carregada: true })), []);
  return estado;
}

/** A reunião ao vivo, se a captura está de pé (inclusive pausada). */
function emAndamentoDe(m: MeetingState | undefined): ReuniaoEmAndamento | null {
  if (!m?.session) return null;
  if (m.phase !== 'recording' && m.phase !== 'paused' && m.phase !== 'captionsRequired') return null;
  return { reuniaoId: m.session.meetingId, titulo: m.session.title };
}

export function PaginaPreparar({
  reuniao,
}: {
  /** O estado da reunião ao vivo: com uma em andamento, a tela avisa que a mudança vale para a próxima. */
  reuniao?: MeetingState;
}) {
  const { conducao, carregada } = useConducao();
  return (
    <div className="tq-pagina tq-prep">
      <header className="tq-prep-topo">
        <MarcaDoTaq estado="repouso" tamanho={48} />
        <h1>Preparar</h1>
      </header>
      {!carregada ? (
        <p className="tq-prep-dica" role="status">Carregando…</p>
      ) : (
        <OQueLevar conducao={conducao} emAndamento={emAndamentoDe(reuniao)} />
      )}
    </div>
  );
}
