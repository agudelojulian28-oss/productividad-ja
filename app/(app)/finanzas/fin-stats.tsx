'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { BarList } from './bar-list';

// Ingresos/Gastos/Balance con filtro de periodo. Por defecto "Este mes" (ADR-026).
// Los datos vienen por proyecto y por mes; aquí se pliegan al periodo elegido.
export type StatRow = { label: string; month: string; inflow: number; outflow: number };
type Period = 'mes' | 'mesPasado' | 'anio' | 'todo';

const PERIODS: { v: Period; label: string }[] = [
  { v: 'mes', label: 'Este mes' },
  { v: 'mesPasado', label: 'Mes pasado' },
  { v: 'anio', label: 'Este año' },
  { v: 'todo', label: 'Todo' },
];

/** 'YYYY-MM' del mes anterior a `monthKey`. */
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export function FinStats({ rows, monthKey }: { rows: StatRow[]; monthKey: string }) {
  const [period, setPeriod] = useState<Period>('mes');
  const [tab, setTab] = useState<'in' | 'out'>('in');

  const { inflow, outflow, fuentes, gastos } = useMemo(() => {
    const prev = prevMonthKey(monthKey);
    const year = monthKey.slice(0, 4);
    const inPeriod = (m: string) => {
      if (period === 'mes') return m.startsWith(monthKey);
      if (period === 'mesPasado') return m.startsWith(prev);
      if (period === 'anio') return m.startsWith(year);
      return true; // 'todo'
    };
    let inSum = 0;
    let outSum = 0;
    const inByProj = new Map<string, number>();
    const outByProj = new Map<string, number>();
    for (const r of rows) {
      if (!inPeriod(r.month)) continue;
      inSum += r.inflow;
      outSum += r.outflow;
      if (r.inflow > 0) inByProj.set(r.label, (inByProj.get(r.label) ?? 0) + r.inflow);
      if (r.outflow > 0) outByProj.set(r.label, (outByProj.get(r.label) ?? 0) + r.outflow);
    }
    const toBars = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, valueLabel: money(value) }));
    return { inflow: inSum, outflow: outSum, fuentes: toBars(inByProj), gastos: toBars(outByProj) };
  }, [rows, monthKey, period]);

  const balance = inflow - outflow;
  const periodLabel = PERIODS.find((p) => p.v === period)!.label.toLowerCase();

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
        {fuentes.length === 0 ? (
          <p className="muted">Sin ingresos por proyecto en {periodLabel}.</p>
        ) : (
          <BarList items={fuentes} tone="accent" />
        )}
      </div>

      <div className={`fin-stats-pane${tab === 'out' ? ' on' : ''}`}>
        <div className="fin-stats-head">
          <span className="fin-stats-k">Salió</span>
          <span className="fin-stats-num fin-neg">{money(outflow, { compact: true })}</span>
        </div>
        {gastos.length === 0 ? (
          <p className="muted">Sin gastos en {periodLabel}.</p>
        ) : (
          <BarList items={gastos} tone="muted" />
        )}
      </div>
    </section>
  );
}
