/**
 * O motor temporal. Os casos aqui são exatamente os que quebravam antes:
 * dia deslocado por fuso, horário de verão, virada de mês e de ano.
 *
 * Nenhum teste usa `Date.now()`: uma suíte que depende de quando roda não prova
 * nada sobre determinismo, que é justamente o que este módulo existe para dar.
 */
import { describe, expect, it } from 'vitest';
import {
  buildTemporalContext,
  civilToInstant,
  formatOffset,
  instantToRfc3339,
  isValidTimezone,
  localDayOf,
  localTimeOf,
  offsetMinutesAt,
} from './temporal.js';

describe('localDayOf — o dia local, não o dia do processo', () => {
  it('não desloca o dia quando o instante em UTC já virou', () => {
    // 22h de 17/09 em Recife (UTC−3) é 01h de 18/09 em UTC. O dia da reunião,
    // para quem estava nela, é 17 — e era isto que o código antigo errava.
    const instante = Date.UTC(2026, 8, 18, 1, 0);
    expect(localDayOf(instante, 'America/Recife')).toBe('2026-09-17');
    expect(localTimeOf(instante, 'America/Recife')).toBe('22:00');
  });

  it('devolve o dia UTC quando o fuso é UTC', () => {
    expect(localDayOf(Date.UTC(2026, 8, 18, 1, 0), 'UTC')).toBe('2026-09-18');
  });

  it('atravessa a virada de ano no fuso local', () => {
    // 21h de 31/12/2026 em São Paulo é 00h de 01/01/2027 em UTC.
    const instante = Date.UTC(2027, 0, 1, 0, 30);
    expect(localDayOf(instante, 'America/Sao_Paulo')).toBe('2026-12-31');
    expect(localDayOf(instante, 'UTC')).toBe('2027-01-01');
  });

  it('anda para a frente em fuso a leste de Greenwich', () => {
    // 23h UTC é 08h do dia seguinte em Tóquio (UTC+9).
    expect(localDayOf(Date.UTC(2026, 8, 17, 23, 0), 'Asia/Tokyo')).toBe('2026-09-18');
  });
});

describe('offsetMinutesAt', () => {
  it('lê o offset do Brasil', () => {
    expect(offsetMinutesAt(Date.UTC(2026, 8, 18, 15, 0), 'America/Recife')).toBe(-180);
  });

  it('lê offset positivo a leste', () => {
    expect(offsetMinutesAt(Date.UTC(2026, 8, 18, 15, 0), 'Asia/Tokyo')).toBe(540);
  });

  it('trata fuso inválido como UTC em vez de explodir', () => {
    expect(offsetMinutesAt(Date.UTC(2026, 8, 18, 15, 0), 'Nao/Existe')).toBe(0);
  });
});

describe('civilToInstant — horário de verão', () => {
  it('acerta o offset ANTES da virada de verão em Nova York', () => {
    // 08/03/2026, 01:00 — ainda EST (−05:00).
    const instante = civilToInstant({ year: 2026, month: 3, day: 8 }, { hour: 1, minute: 0 }, 'America/New_York');
    expect(offsetMinutesAt(instante, 'America/New_York')).toBe(-300);
    expect(localTimeOf(instante, 'America/New_York')).toBe('01:00');
  });

  it('acerta o offset DEPOIS da virada de verão em Nova York', () => {
    // Mesmo dia, 15:00 — já EDT (−04:00). É a segunda passada que corrige isto:
    // resolver o offset "de hoje" e aplicá-lo à tarde poria a reunião 1h fora.
    const instante = civilToInstant({ year: 2026, month: 3, day: 8 }, { hour: 15, minute: 0 }, 'America/New_York');
    expect(offsetMinutesAt(instante, 'America/New_York')).toBe(-240);
    expect(localTimeOf(instante, 'America/New_York')).toBe('15:00');
  });

  it('acerta a volta do horário de verão (hora repetida)', () => {
    // 01/11/2026 — o relógio volta de 02:00 para 01:00. Não há resposta única;
    // o que importa é devolver um instante REAL cujo relógio local seja 01:30.
    const instante = civilToInstant({ year: 2026, month: 11, day: 1 }, { hour: 1, minute: 30 }, 'America/New_York');
    expect(localTimeOf(instante, 'America/New_York')).toBe('01:30');
    expect(localDayOf(instante, 'America/New_York')).toBe('2026-11-01');
  });

  it('não perde o compromisso numa hora PULADA', () => {
    // 08/03/2026 02:30 não existe em Nova York — o relógio salta de 02:00 para
    // 03:00. Um instante real precisa sair daqui de qualquer forma.
    const instante = civilToInstant({ year: 2026, month: 3, day: 8 }, { hour: 2, minute: 30 }, 'America/New_York');
    expect(Number.isFinite(instante)).toBe(true);
    expect(localDayOf(instante, 'America/New_York')).toBe('2026-03-08');
  });

  it('ida e volta preserva data e hora no Brasil', () => {
    const instante = civilToInstant({ year: 2026, month: 9, day: 18 }, { hour: 14, minute: 0 }, 'America/Recife');
    expect(localDayOf(instante, 'America/Recife')).toBe('2026-09-18');
    expect(localTimeOf(instante, 'America/Recife')).toBe('14:00');
  });
});

describe('instantToRfc3339', () => {
  it('formata no fuso pedido, com offset', () => {
    expect(instantToRfc3339(Date.UTC(2026, 8, 18, 17, 0, 0), 'America/Recife')).toBe(
      '2026-09-18T14:00:00-03:00',
    );
  });
});

describe('formatOffset', () => {
  it('formata negativo e positivo', () => {
    expect(formatOffset(-180)).toBe('-03:00');
    expect(formatOffset(540)).toBe('+09:00');
    expect(formatOffset(0)).toBe('+00:00');
    // Índia: meia hora de offset.
    expect(formatOffset(330)).toBe('+05:30');
  });
});

describe('isValidTimezone', () => {
  it('aceita IANA e recusa sigla', () => {
    expect(isValidTimezone('America/Recife')).toBe(true);
    expect(isValidTimezone('BRT')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('-03:00')).toBe(false);
  });

  it('aceita IANA de um componente só — UTC é o caso que importa', () => {
    // A versão anterior exigia "/" no nome e recusava estes. Numa máquina
    // configurada em UTC — servidor, imagem corporativa, boa parte do Linux —
    // isso descartava o fuso real de quem capturou e o trocava por
    // America/Sao_Paulo em silêncio, com o dia local podendo sair errado.
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('GMT')).toBe(true);
    expect(isValidTimezone('Japan')).toBe(true);
  });

  it('recusa offset puro em qualquer forma, que o Intl aceitaria', () => {
    // Offset não tem regra de horário de verão, então não resolve "terça que
    // vem". O Intl aceita todos estes sem reclamar — recusar é trabalho daqui.
    for (const offset of ['-03:00', '+03:00', '+0300', '+03', 'Z']) {
      expect(isValidTimezone(offset)).toBe(false);
    }
  });

  it('recusa o que não é fuso nenhum', () => {
    expect(isValidTimezone('xyz')).toBe(false);
    expect(isValidTimezone('Nao/Existe')).toBe(false);
  });
});

describe('buildTemporalContext', () => {
  const inicio = Date.UTC(2026, 8, 18, 1, 0); // 17/09 22h em Recife
  const fim = Date.UTC(2026, 8, 18, 2, 0);

  it('marca confiança alta quando o fuso veio da extensão', () => {
    const ctx = buildTemporalContext({
      startedAtMs: inicio,
      endedAtMs: fim,
      timezone: 'America/Recife',
      source: 'extensao',
    });
    expect(ctx.timezone).toBe('America/Recife');
    expect(ctx.timezoneSource).toBe('extensao');
    expect(ctx.timezoneConfidence).toBe('alta');
    expect(ctx.localDate).toBe('2026-09-17');
    expect(ctx.localTime).toBe('22:00');
    expect(ctx.startedAt).toBe('2026-09-17T22:00:00-03:00');
  });

  it('cai para o padrão com confiança BAIXA quando o fuso é inválido', () => {
    const ctx = buildTemporalContext({
      startedAtMs: inicio,
      endedAtMs: fim,
      timezone: 'Nao/Existe',
      source: 'extensao',
    });
    expect(ctx.timezone).toBe('America/Sao_Paulo');
    expect(ctx.timezoneSource).toBe('padrao');
    expect(ctx.timezoneConfidence).toBe('baixa');
  });

  it('trata fuso ausente como padrão, sem quebrar', () => {
    const ctx = buildTemporalContext({
      startedAtMs: inicio,
      endedAtMs: fim,
      timezone: null,
      source: 'payload',
    });
    expect(ctx.timezone).toBe('America/Sao_Paulo');
    expect(ctx.timezoneConfidence).toBe('baixa');
  });

  it('confiança média quando o fuso veio declarado no payload', () => {
    const ctx = buildTemporalContext({
      startedAtMs: inicio,
      endedAtMs: fim,
      timezone: 'America/Recife',
      source: 'payload',
    });
    expect(ctx.timezoneConfidence).toBe('media');
  });
});
