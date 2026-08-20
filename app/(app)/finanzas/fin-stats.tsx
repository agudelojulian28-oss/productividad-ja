'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { MiniMountain } from './mini-mountain';

// Ingresos/Gastos/Balance con filtro de periodo. Por cada proyecto, una montañita con
// sus últimas 6 cubetas SEGÚN el filtro: mensual → 6 semanas; anual/todo → 6 meses.
export type StatRow = { label: string; month: string; inflow: number; outflow: number };
export type TrendTx = { label: string; dir: 'in' | 'out'; amount: number; date: string };
type Period = 'mes' | 'mesPasado' | 'anio' | 'todo';

const PERIODS: { v: Period; label: string }[] = [
  { v: 'mes', label: 'Este mes' },
  { v: 'mesPasado', label: 'Mes pasado' },
  { v: 'anio', label: 'Este año' },
  { v: 'todo', label: 'Todo' },
];
const BUCKETS = 6;
const DAY = 86_400_000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ymdMs = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** 'YYYY-MM' del mes anterior a `monthKey`. */
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

type ProjTrend = { label: string; valueLabel: string; series: number[] };

export function FinStats({
  rows,
  monthKey,
  trendTx = [],
  today,
}: {
  rows: StatRow[];
  monthKey: string;
  trendTx?: TrendTx[];
  today: string;
}) {
  const [period, setPeriod] = useState<Period>('mes');
  const [tab, setTab] = useState<'in' | 'out'>('in');

  const { inflow, outflow, labels, fuentes, gastos } = useMemo(() => {
    const prev = prevMonthKey(monthKey);
    const year = monthKey.slice(0, 4);
    const inPeriod = (m: string) => {
      if (period === 'mes') return m.startsWith(monthKey);
      if (period === 'mesPasado') return m.startsWith(prev);
      if (period === 'anio') return m.startsWith(year);
      return true; // 'todo'
    };

    // ── Cubetas de la montañita, según el filtro ──────────────────────────────
    const weekly = period === 'mes' || period === 'mesPasado';
    let labels: string[];
    let assign: (date: string) => number; // índice de cubeta 0..5, o -1 si queda fuera
    if (weekly) {
      const todayMs = ymdMs(today);
      labels = Array.from({ length: BUCKETS }, (_, i) => {
        const start = todayMs - ((BUCKETS - 1 - i) * 7 + 6) * DAY;
        const d = new Date(start);
        return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      });
      assign = (date) => {
        const daysAgo = Math.floor((todayMs - ymdMs(date)) / DAY);
        if (daysAgo < 0 || daysAgo >= BUCKETS * 7) return -1;
        return BUCKETS - 1 - Math.floor(daysAgo / 7);
      };
    } else {
      const [y, m] = monthKey.split('-').map(Number);
      const ms = Array.from({ length: BUCKETS }, (_, i) =>
        new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 - (BUCKETS - 1 - i), 1)).toISOString().slice(0, 7),
      );
      labels = ms.map((mm) => MESES[Number(mm.slice(5, 7)) - 1] ?? mm);
      assign = (date) => ms.indexOf(date.slice(0, 7));
    }

    const inSeries = new Map<string, number[]>();
    const outSeries = new Map<string, number[]>();
    for (const t of trendTx) {
      const idx = assign(t.date);
      if (idx < 0) continue;
      const map = t.dir === 'in' ? inSeries : outSeries;
      let arr = map.get(t.label);
      if (!arr) {
        arr = new Array(BUCKETS).fill(0);
        map.set(t.label, arr);
      }
      arr[idx] = (arr[idx] ?? 0) + t.amount;
    }

    // ── Totales del periodo (la cifra a la derecha) ───────────────────────────
    const inTotal = new Map<string, number>();
    const outTotal = new Map<string, number>();
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (!inPeriod(r.month)) continue;
      inflow += r.inflow;
      outflow += r.outflow;
      if (r.inflow > 0) inTotal.set(r.label, (inTotal.get(r.label) ?? 0) + r.inflow);
      if (r.outflow > 0) outTotal.set(r.label, (outTotal.get(r.label) ?? 0) + r.outflow);
    }

    const build = (totals: Map<string, number>, series: Map<string, number[]>): ProjTrend[] =>
      [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, total]) => ({
          label,
          valueLabel: money(total),
          series: series.get(label) ?? new Array(BUCKETS).fill(0),
        }));

    return { inflow, outflow, labels, fuentes: build(inTotal, inSeries), gastos: build(outTotal, outSeries) };
  }, [rows, monthKey, period, trendTx, today]);

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
            <MiniMountain labels={labels} values={it.series} tone={tone} />
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
