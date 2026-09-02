// Análisis financiero (puro): normaliza recurrentes a mensual, evalúa la "salud" de las
// finanzas y proyecta los próximos meses. Lee las mismas cifras que el panel (SerieMes de
// la vista de flujo + recurrentes + saldo del fondo de emergencia). Sin efectos.

import type { SerieMes } from './queries';
import type { RecurringFrequency } from './ports';

const FACTOR: Record<RecurringFrequency, number> = {
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  anual: 1 / 12,
};

/** Monto mensual-equivalente de un recurrente según su frecuencia. */
export function monthlyEquivRecurring(amountMinor: number, freq: RecurringFrequency): number {
  return Math.round(amountMinor * FACTOR[freq]);
}

export interface RecurItem {
  direction: 'in' | 'out';
  projectId: string;
  amountMinor: number;
  frequency: RecurringFrequency;
}

/** Suma mensual-equivalente de recurrentes (ingresos, gastos y neto). */
export function recurringMonthly(items: RecurItem[]): { inMinor: number; outMinor: number; netMinor: number } {
  let inMinor = 0;
  let outMinor = 0;
  for (const r of items) {
    const eq = monthlyEquivRecurring(r.amountMinor, r.frequency);
    if (r.direction === 'in') inMinor += eq;
    else outMinor += eq;
  }
  return { inMinor, outMinor, netMinor: inMinor - outMinor };
}

/** Agrupa recurrentes por proyecto con subtotal mensual-equivalente; ordena desc por subtotal. */
export function recurringByProject(
  items: (RecurItem & { id: string; label: string })[],
): { projectId: string; totalMonthlyMinor: number; items: (RecurItem & { id: string; label: string })[] }[] {
  const m = new Map<string, (RecurItem & { id: string; label: string })[]>();
  for (const r of items) {
    const arr = m.get(r.projectId) ?? [];
    arr.push(r);
    m.set(r.projectId, arr);
  }
  return [...m.entries()]
    .map(([projectId, list]) => ({
      projectId,
      totalMonthlyMinor: list.reduce((s, r) => s + monthlyEquivRecurring(r.amountMinor, r.frequency), 0),
      items: list,
    }))
    .sort((a, b) => b.totalMonthlyMinor - a.totalMonthlyMinor);
}

export type Verdict = 'sana' | 'atencion' | 'riesgo';
export type Trend = 'mejora' | 'estable' | 'baja';

export interface ReporteFinanciero {
  monthsUsed: number;
  avgInMinor: number;
  avgOutMinor: number;
  avgNetMinor: number;
  savingsRatePct: number | null; // neto / ingresos
  recurringInMinor: number;
  recurringOutMinor: number;
  recurringNetMinor: number;
  fixedCostRatioPct: number | null; // gastos fijos / ingresos promedio
  emergencyCoverageMonths: number | null; // saldo fondo / gasto mensual promedio
  trend: Trend;
  score: number; // 0–100
  verdict: Verdict;
  projection: { month: string; netMinor: number; cumulativeMinor: number }[]; // month = 'YYYY-MM'
}

function monthsWithData(serie: SerieMes[]): SerieMes[] {
  return serie.filter((m) => m.inflowMinor > 0 || m.outflowMinor > 0);
}
function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

/** Informe de salud financiera + proyección de los próximos meses. */
export function reporteFinanciero(params: {
  serie: SerieMes[]; // todos los meses, ascendente
  recurrentes: RecurItem[];
  emergencyBalanceMinor: number;
  today: string; // YYYY-MM-DD
  months?: number; // ventana histórica (def 6)
  projectMonths?: number; // horizonte de proyección (def 3)
}): ReporteFinanciero {
  const { serie, recurrentes, emergencyBalanceMinor, today } = params;
  const months = params.months ?? 6;
  const projectMonths = params.projectMonths ?? 3;

  const conDatos = monthsWithData(serie).slice(-months);
  const n = conDatos.length;
  const sum = conDatos.reduce(
    (a, m) => ({ in: a.in + m.inflowMinor, out: a.out + m.outflowMinor, net: a.net + m.netMinor }),
    { in: 0, out: 0, net: 0 },
  );
  const avgInMinor = n ? Math.round(sum.in / n) : 0;
  const avgOutMinor = n ? Math.round(sum.out / n) : 0;
  const avgNetMinor = n ? Math.round(sum.net / n) : 0;

  const rec = recurringMonthly(recurrentes);
  const savingsRatePct = avgInMinor > 0 ? Math.round((avgNetMinor / avgInMinor) * 100) : null;
  const fixedCostRatioPct = avgInMinor > 0 ? Math.round((rec.outMinor / avgInMinor) * 100) : null;
  const emergencyCoverageMonths = avgOutMinor > 0 ? Math.round((emergencyBalanceMinor / avgOutMinor) * 10) / 10 : null;

  // Tendencia: promedio neto reciente vs. el anterior (mitades de la ventana con datos).
  let trend: Trend = 'estable';
  if (n >= 4) {
    const half = Math.floor(n / 2);
    const prev = conDatos.slice(0, half);
    const recent = conDatos.slice(n - half);
    const avg = (arr: SerieMes[]) => arr.reduce((s, m) => s + m.netMinor, 0) / arr.length;
    const p = avg(prev);
    const r = avg(recent);
    if (r > p + Math.abs(p) * 0.05 + 1) trend = 'mejora';
    else if (r < p - Math.abs(p) * 0.05 - 1) trend = 'baja';
  }

  // Score ponderado (transparente): ahorro 35, cobertura 30, costos fijos 20, tendencia 15.
  const savingsPts = savingsRatePct === null ? 0 : savingsRatePct >= 20 ? 35 : savingsRatePct >= 10 ? 25 : savingsRatePct >= 0 ? 15 : 0;
  const coveragePts =
    emergencyCoverageMonths === null ? 0 : emergencyCoverageMonths >= 6 ? 30 : emergencyCoverageMonths >= 3 ? 20 : emergencyCoverageMonths >= 1 ? 10 : 3;
  const fixedPts = fixedCostRatioPct === null ? 10 : fixedCostRatioPct <= 50 ? 20 : fixedCostRatioPct <= 75 ? 12 : fixedCostRatioPct <= 100 ? 5 : 0;
  const trendPts = trend === 'mejora' ? 15 : trend === 'estable' ? 10 : 3;
  const score = Math.max(0, Math.min(100, savingsPts + coveragePts + fixedPts + trendPts));
  const verdict: Verdict = score >= 70 ? 'sana' : score >= 40 ? 'atencion' : 'riesgo';

  // Proyección: a este ritmo (neto promedio) hacia adelante, acumulado.
  const startMonth = today.slice(0, 7);
  const projection: ReporteFinanciero['projection'] = [];
  let cursor = startMonth;
  let cumulative = 0;
  for (let i = 0; i < projectMonths; i++) {
    cursor = nextMonth(cursor);
    cumulative += avgNetMinor;
    projection.push({ month: cursor, netMinor: avgNetMinor, cumulativeMinor: cumulative });
  }

  return {
    monthsUsed: n,
    avgInMinor,
    avgOutMinor,
    avgNetMinor,
    savingsRatePct,
    recurringInMinor: rec.inMinor,
    recurringOutMinor: rec.outMinor,
    recurringNetMinor: rec.netMinor,
    fixedCostRatioPct,
    emergencyCoverageMonths,
    trend,
    score,
    verdict,
    projection,
  };
}
