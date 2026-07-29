// Utilidades puras de agenda: detectar solapes y proponer huecos libres.
// Operan sobre eventos de calendario (subconjunto de GEvent). Sin red, testeables.

import { minutesInTz } from '@/lib/format';

export interface AgendaEvent {
  summary: string;
  start: string | null; // ISO
  end: string | null; // ISO
  allDay: boolean;
}

export interface Choque {
  a: string; // título del primer evento
  b: string; // título del segundo
  startIso: string; // inicio del solape
  endIso: string; // fin del solape
}

interface Interval {
  s: number; // ms
  e: number; // ms
  t: string; // título
}

function timed(events: AgendaEvent[]): Interval[] {
  return events
    .filter((e) => !e.allDay && e.start && e.end)
    .map((e) => ({ s: new Date(e.start!).getTime(), e: new Date(e.end!).getTime(), t: e.summary }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
}

/** Pares de eventos con hora que se solapan. Ignora eventos de todo el día. */
export function detectarChoques(events: AgendaEvent[]): Choque[] {
  const evs = timed(events);
  const out: Choque[] = [];
  for (let i = 0; i < evs.length; i++) {
    const a = evs[i]!;
    for (let j = i + 1; j < evs.length; j++) {
      const b = evs[j]!;
      if (b.s >= a.e) break; // ordenados por inicio: nada más solapa con `a`
      const os = Math.max(a.s, b.s);
      const oe = Math.min(a.e, b.e);
      if (oe > os) {
        out.push({
          a: a.t,
          b: b.t,
          startIso: new Date(os).toISOString(),
          endIso: new Date(oe).toISOString(),
        });
      }
    }
  }
  return out;
}

export interface Hueco {
  startIso: string;
  endIso: string;
}

export interface HuecosOpts {
  fromIso: string;
  toIso: string;
  duracionMin: number;
  tz: string;
  /** Horario laboral (minutos desde medianoche, en la zona del usuario). */
  dayStart?: number; // por defecto 8:00
  dayEnd?: number; // por defecto 20:00
}

/** Huecos libres de al menos `duracionMin` entre [fromIso, toIso], cuyo inicio caiga
 *  dentro del horario laboral (en la zona del usuario). Fusiona eventos solapados. */
export function huecosLibres(events: AgendaEvent[], opts: HuecosOpts): Hueco[] {
  const dayStart = opts.dayStart ?? 8 * 60;
  const dayEnd = opts.dayEnd ?? 20 * 60;
  const dur = opts.duracionMin * 60000;
  const from = new Date(opts.fromIso).getTime();
  const to = new Date(opts.toIso).getTime();
  if (!(to > from)) return [];

  const busy = timed(events).filter((i) => i.e > from && i.s < to);
  const merged: Interval[] = [];
  for (const i of busy) {
    const last = merged[merged.length - 1];
    if (last && i.s <= last.e) last.e = Math.max(last.e, i.e);
    else merged.push({ ...i });
  }

  const gaps: Array<{ s: number; e: number }> = [];
  let cur = from;
  for (const b of merged) {
    if (b.s > cur) gaps.push({ s: cur, e: Math.min(b.s, to) });
    cur = Math.max(cur, b.e);
    if (cur >= to) break;
  }
  if (cur < to) gaps.push({ s: cur, e: to });

  const out: Hueco[] = [];
  for (const g of gaps) {
    if (g.e - g.s < dur) continue;
    const mins = minutesInTz(new Date(g.s).toISOString(), opts.tz);
    if (mins >= dayStart && mins <= dayEnd - opts.duracionMin) {
      out.push({ startIso: new Date(g.s).toISOString(), endIso: new Date(g.e).toISOString() });
    }
  }
  return out;
}
