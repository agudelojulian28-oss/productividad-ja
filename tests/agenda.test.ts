import { describe, it, expect } from 'vitest';
import { detectarChoques, huecosLibres, type AgendaEvent } from '@/lib/agenda';

const TZ = 'America/Bogota'; // UTC-5

function ev(startIso: string, endIso: string, summary = 'x', allDay = false): AgendaEvent {
  return { start: startIso, end: endIso, summary, allDay };
}

describe('detectarChoques', () => {
  it('detecta un solape simple', () => {
    const r = detectarChoques([
      ev('2026-08-01T15:00:00Z', '2026-08-01T16:00:00Z', 'A'),
      ev('2026-08-01T15:30:00Z', '2026-08-01T16:30:00Z', 'B'),
    ]);
    expect(r.length).toBe(1);
    expect(r[0]!.a).toBe('A');
    expect(r[0]!.b).toBe('B');
    expect(r[0]!.startIso).toBe('2026-08-01T15:30:00.000Z');
    expect(r[0]!.endIso).toBe('2026-08-01T16:00:00.000Z');
  });

  it('no marca eventos contiguos (fin == inicio)', () => {
    const r = detectarChoques([
      ev('2026-08-01T15:00:00Z', '2026-08-01T16:00:00Z'),
      ev('2026-08-01T16:00:00Z', '2026-08-01T17:00:00Z'),
    ]);
    expect(r.length).toBe(0);
  });

  it('ignora eventos de todo el día', () => {
    const r = detectarChoques([
      ev('2026-08-01', '2026-08-02', 'todo el día', true),
      ev('2026-08-01T15:00:00Z', '2026-08-01T16:00:00Z'),
    ]);
    expect(r.length).toBe(0);
  });
});

describe('huecosLibres', () => {
  // Ventana: 1 ago 08:00–20:00 Bogotá = 13:00Z–01:00Z(+1).
  const from = '2026-08-01T13:00:00Z'; // 08:00 Bogotá
  const to = '2026-08-01T22:00:00Z'; // 17:00 Bogotá

  it('encuentra un hueco entre dos eventos', () => {
    const r = huecosLibres(
      [
        ev('2026-08-01T14:00:00Z', '2026-08-01T15:00:00Z'), // 9-10
        ev('2026-08-01T17:00:00Z', '2026-08-01T18:00:00Z'), // 12-13
      ],
      { fromIso: from, toIso: to, duracionMin: 60, tz: TZ },
    );
    // hueco 08-09, 10-12, 13-17 (todos dentro de horario laboral)
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.some((h) => h.startIso === '2026-08-01T15:00:00.000Z')).toBe(true);
  });

  it('descarta huecos más cortos que la duración pedida', () => {
    const r = huecosLibres(
      [
        ev('2026-08-01T13:30:00Z', '2026-08-01T14:00:00Z'),
        ev('2026-08-01T14:30:00Z', '2026-08-01T22:00:00Z'),
      ],
      { fromIso: from, toIso: to, duracionMin: 60, tz: TZ },
    );
    // el único hueco entre eventos es 14:00-14:30Z (30 min) → descartado
    expect(r.some((h) => h.startIso === '2026-08-01T14:00:00.000Z')).toBe(false);
  });

  it('sin eventos: un solo hueco que cubre la ventana', () => {
    const r = huecosLibres([], { fromIso: from, toIso: to, duracionMin: 60, tz: TZ });
    expect(r.length).toBe(1);
    expect(r[0]!.startIso).toBe('2026-08-01T13:00:00.000Z');
  });
});
