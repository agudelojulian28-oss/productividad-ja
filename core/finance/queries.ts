// Reductores puros sobre las filas de las vistas fin_*. El panel y el agente
// llaman EXACTAMENTE estas funciones sobre los mismos datos → no pueden discrepar
// (principio §1 de docs/panel-finanzas.md). Aquí no se toca `transactions`: se
// pliegan cifras ya sumadas por SQL (por área/mes) a los totales que se muestran.

import type { CashflowMonthRow, BySourceRow, ExpenseCategoryRow } from './ports';

export interface ResumenFinanciero {
  monthKey: string; // 'YYYY-MM'
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  movements: number;
  lastRecordedAt: string | null;
  staleDays: number | null;
  stale: boolean; // último movimiento registrado hace > 3 días
}

export interface SerieMes {
  month: string; // 'YYYY-MM-DD' (primero del mes)
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
}

/** Mes actual ('YYYY-MM') en la zona del usuario, no en UTC. */
export function mesActual(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).format(now); // en-CA da 'YYYY-MM'
}

function daysSince(iso: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000);
}

/** ② Este mes y ③ Neto, sumando las filas por área del mes actual. */
export function resumenFinanciero(
  cashflow: CashflowMonthRow[],
  tz: string,
  now: Date = new Date(),
): ResumenFinanciero {
  const monthKey = mesActual(tz, now);
  let inflowMinor = 0;
  let outflowMinor = 0;
  let movements = 0;
  let lastRecordedAt: string | null = null;

  for (const r of cashflow) {
    if (r.month.startsWith(monthKey)) {
      inflowMinor += r.inflowMinor;
      outflowMinor += r.outflowMinor;
      movements += r.movements;
    }
    // El "último movimiento registrado" es global, de cualquier mes.
    if (r.lastRecordedAt && (!lastRecordedAt || r.lastRecordedAt > lastRecordedAt)) {
      lastRecordedAt = r.lastRecordedAt;
    }
  }

  const staleDays = lastRecordedAt ? daysSince(lastRecordedAt, now.getTime()) : null;
  return {
    monthKey,
    inflowMinor,
    outflowMinor,
    netMinor: inflowMinor - outflowMinor,
    movements,
    lastRecordedAt,
    staleDays,
    stale: staleDays !== null && staleDays > 3,
  };
}

/** Serie mensual (últimos `months` meses con datos) para el gráfico de flujo. */
export function serieMensual(cashflow: CashflowMonthRow[], months = 6): SerieMes[] {
  const byMonth = new Map<string, SerieMes>();
  for (const r of cashflow) {
    const cur = byMonth.get(r.month) ?? {
      month: r.month,
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
    };
    cur.inflowMinor += r.inflowMinor;
    cur.outflowMinor += r.outflowMinor;
    cur.netMinor += r.netMinor;
    byMonth.set(r.month, cur);
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months);
}

/** ⑤ Gastos top-N del mes actual (lista ordenada, no torta). */
export function topGastos(
  expenses: ExpenseCategoryRow[],
  tz: string,
  n = 5,
  now: Date = new Date(),
): { category: string; amountMinor: number }[] {
  const monthKey = mesActual(tz, now);
  const acc = new Map<string, number>();
  for (const e of expenses) {
    if (!e.month.startsWith(monthKey)) continue;
    acc.set(e.category, (acc.get(e.category) ?? 0) + e.amountMinor);
  }
  return [...acc.entries()]
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, n);
}

/** ④ Por fuente, ordenadas por lo del mes (ya vienen agregadas por V2). */
export function porFuente(sources: BySourceRow[]): BySourceRow[] {
  return [...sources].sort((a, b) => b.thisMonthMinor - a.thisMonthMinor);
}
