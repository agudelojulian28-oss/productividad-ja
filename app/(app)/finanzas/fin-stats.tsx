'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { MiniMountain } from './mini-mountain';

// Ingresos/Gastos/Balance con filtro de periodo. Por defecto "Este mes" (ADR-026).
// Por cada proyecto se muestra una montañita (área) con su serie mensual.
export type StatRow = { label: string; month: string; inflow: number; outflow: number };
type Period = 'mes' | 'mesPasado' | 'anio' | 'todo';

const PERIODS: { v: Period; label: string }[] = [
  { v: 'mes', label: 'Este mes' },
  { v: 'mesPasado', label: 'Mes pasado' },
  { v: 'anio', label: 'Este año' },
  { v: 'todo', label: 'Todo' },
];
const TREND_MONTHS = 8; // meses visibles en la montañita

/** 'YYYY-MM' del mes anterior a `monthKey`. */
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

type ProjTrend = { label: string; valueLabel: string; series: number[] };

export function FinStats({ rows, monthKey }: { rows: StatRow[]; monthKey: string }) {
  const [period, setPeriod] = useState<Period>('mes');
  const [tab, setTab] = useState<'in' | 'out'>('in');

  const { inflow, outflow, months, fuentes, gastos } = useMemo(() => {
    const prev = prevMonthKey(monthKey);
    const year = monthKey.slice(0, 4);
    const inPeriod = (m: string) => {
      if (period === 'mes') return m.startsWith(monthKey);
      if (period === 'mesPasado') return m.startsWith(prev);
      if (period === 'anio') return m.startsWith(year);
      return true; // 'todo'
    };
    // Ventana de meses para la montañita (con datos, cronológica).
    const months = [...new Set(rows.map((r) => r.month))].sort().slice(-TREND_MONTHS);

    // Serie mensual por proyecto (para la montañita) y totales del periodo (para la cifra).
    const inMonthly = new Map<string, Map<string, number>>();
    const outMonthly = new Map<string, Map<string, number>>();
    const inTotal = new Map<string, number>();
    const outTotal = new Map<string, number>();
    let inflow = 0;
    let outflow = 0;
    const bump = (map: Map<string, Map<string, number>>, label: string, month: string, v: number) => {
      let m = map.get(label);
      if (!m) {
        m = new Map();
        map.set(label, m);
      }
      m.set(month, (m.get(month) ?? 0) + v);
    };
    for (const r of rows) {
      if (r.inflow > 0) bump(inMonthly, r.label, r.month, r.inflow);
      if (r.outflow > 0) bump(outMonthly, r.label, r.month, r.outflow);
      if (inPeriod(r.month)) {
        inflow += r.inflow;
        outflow += r.outflow;
        if (r.inflow > 0) inTotal.set(r.label, (inTotal.get(r.label) ?? 0) + r.inflow);
        if (r.outflow > 0) outTotal.set(r.label, (outTotal.get(r.label) ?? 0) + r.outflow);
      }
    }
    const build = (
      totals: Map<string, number>,
      monthly: Map<string, Map<string, number>>,
    ): ProjTrend[] =>
      [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, total]) => ({
          label,
          valueLabel: money(total),
          series: months.map((m) => monthly.get(label)?.get(m) ?? 0),
        }));

    return { inflow, outflow, months, fuentes: build(inTotal, inMonthly), gastos: build(outTotal, outMonthly) };
  }, [rows, monthKey, period]);

  const balance = inflow - outflow;
  const periodLabel = PERIODS.find((p) => p.v === period)!.label.toLowerCase();

  const pane = (items: ProjTrend[], tone: 'accent' | 'muted', vacio: string) =>
    items.length === 0 ? (
      <p className="muted">{vacio}</p>
    ) : (
      <div className="ptrend">
        {items.map((it) => (
          <div key={it.label} className="ptrend-row">
            <div className="ptrend-head">
              <span className="ptrend-label">{it.label}</span>
              <span className="ptrend-val">{it.valueLabel}</span>
            </div>
            <MiniMountain months={months} values={it.series} tone={tone} />
          </div>
        ))}
      </div>
    );

  return (
    <section className="fin-block fin-stats">
      <div className="seg fin-period-seg" role="tablist" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button
            key={p.v}
            type="button"
            role="tab"
            aria-selected={period === p.v}
            className={`seg-btn${period === p.v ? ' seg-on' : ''}`}
            onClick={() => setPeriod(p.v)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="fin-stats-balance">
        <span className="fin-stats-k">Balance · {periodLabel}</span>
        <span className={`fin-stats-num ${balance >= 0 ? 'fin-pos' : 'fin-neg'}`}>
          {money(balance, { compact: true })}
        </span>
      </div>

      <div className="seg fin-stats-seg">
        <button
          type="button"
          className={`seg-btn${tab === 'in' ? ' seg-on' : ''}`}
          onClick={() => setTab('in')}
        >
          Ingresos
        </button>
        <button
          type="button"
          className={`seg-btn${tab === 'out' ? ' seg-on' : ''}`}
          onClick={() => setTab('out')}
        >
          Gastos
        </button>
      </div>

      <div className={`fin-stats-pane${tab === 'in' ? ' on' : ''}`}>
        <div className="fin-stats-head">
          <span className="fin-stats-k">Entró</span>
          <span className="fin-stats-num fin-pos">{money(inflow, { compact: true })}</span>
        </div>
        {pane(fuentes, 'accent', `Sin ingresos por proyecto en ${periodLabel}.`)}
      </div>

      <div className={`fin-stats-pane${tab === 'out' ? ' on' : ''}`}>
        <div className="fin-stats-head">
          <span className="fin-stats-k">Salió</span>
          <span className="fin-stats-num fin-neg">{money(outflow, { compact: true })}</span>
        </div>
        {pane(gastos, 'muted', `Sin gastos en ${periodLabel}.`)}
      </div>
    </section>
  );
}
