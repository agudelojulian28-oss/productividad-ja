'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { money } from '@/lib/format';
import { getProjectExtrasAction } from '@/app/actions/finance';
import { MiniMountain } from './mini-mountain';
import { Dropdown } from '../dropdown';
import { Modal } from '../modal';

// General (ingresos/gastos/balance) con filtro de periodo (desplegable) y, por proyecto,
// su BALANCE con una montañita; al tocar un proyecto se abre su detalle.
export type StatRow = {
  projectId: string;
  label: string;
  month: string;
  inflow: number;
  outflow: number;
  movements: number;
};
export type TrendTx = { projectId: string; dir: 'in' | 'out'; amount: number; date: string };
export type RecentMov = {
  id: string;
  projectId: string | null;
  direction: 'in' | 'out';
  title: string;
  baseAmountMinor: number;
  occurredOn: string; // etiqueta legible del día
};

type Period = 'mes' | 'mesPasado' | 'anio' | 'todo';
const PERIODS: { v: string; label: string }[] = [
  { v: 'mes', label: 'Este mes' },
  { v: 'mesPasado', label: 'Mes pasado' },
  { v: 'anio', label: 'Este año' },
  { v: 'todo', label: 'Todo' },
];
const periodLabelOf = (v: Period) => PERIODS.find((p) => p.v === v)!.label.toLowerCase();

const BUCKETS = 6;
const DAY = 86_400_000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ymdMs = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).toISOString().slice(0, 10);
}

type Proj = {
  projectId: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  movements: number;
  netSeries: number[];
};

export function FinStats({
  rows,
  monthKey,
  trendTx = [],
  recent = [],
  today,
}: {
  rows: StatRow[];
  monthKey: string;
  trendTx?: TrendTx[];
  recent?: RecentMov[];
  today: string;
}) {
  const [period, setPeriod] = useState<Period>('mes');
  const [detailId, setDetailId] = useState<string | null>(null);

  const { inflow, outflow, labels, inAgg, outAgg, netAgg, projects, range, prevNet } = useMemo(() => {
    const prev = prevMonthKey(monthKey);
    const year = monthKey.slice(0, 4);
    const inPeriod = (m: string) => {
      if (period === 'mes') return m.startsWith(monthKey);
      if (period === 'mesPasado') return m.startsWith(prev);
      if (period === 'anio') return m.startsWith(year);
      return true;
    };

    // Cubetas de las montañitas según el filtro (mensual → semanas; anual/todo → meses).
    const weekly = period === 'mes' || period === 'mesPasado';
    let labels: string[];
    let assign: (date: string) => number;
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

    // Series NET por proyecto + agregados generales.
    const netSeries = new Map<string, number[]>();
    const inAgg = new Array<number>(BUCKETS).fill(0);
    const outAgg = new Array<number>(BUCKETS).fill(0);
    for (const t of trendTx) {
      const idx = assign(t.date);
      if (idx < 0) continue;
      let arr = netSeries.get(t.projectId);
      if (!arr) {
        arr = new Array(BUCKETS).fill(0);
        netSeries.set(t.projectId, arr);
      }
      arr[idx] = (arr[idx] ?? 0) + (t.dir === 'in' ? t.amount : -t.amount);
      if (t.dir === 'in') inAgg[idx] = (inAgg[idx] ?? 0) + t.amount;
      else outAgg[idx] = (outAgg[idx] ?? 0) + t.amount;
    }
    const netAgg = inAgg.map((v, i) => v - (outAgg[i] ?? 0));

    // Totales del periodo por proyecto.
    const acc = new Map<string, { label: string; inflow: number; outflow: number; movements: number }>();
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (!inPeriod(r.month)) continue;
      inflow += r.inflow;
      outflow += r.outflow;
      const cur = acc.get(r.projectId) ?? { label: r.label, inflow: 0, outflow: 0, movements: 0 };
      cur.inflow += r.inflow;
      cur.outflow += r.outflow;
      cur.movements += r.movements;
      acc.set(r.projectId, cur);
    }
    const projects: Proj[] = [...acc.entries()]
      .map(([projectId, v]) => ({
        projectId,
        label: v.label,
        inflow: v.inflow,
        outflow: v.outflow,
        net: v.inflow - v.outflow,
        movements: v.movements,
        netSeries: netSeries.get(projectId) ?? new Array(BUCKETS).fill(0),
      }))
      .sort((a, b) => b.net - a.net);

    // Rango de fechas del periodo (para cargar el detalle del proyecto).
    const firstOfMonth = `${monthKey}-01`;
    const range =
      period === 'mes'
        ? { from: firstOfMonth, to: today }
        : period === 'mesPasado'
          ? { from: `${prev}-01`, to: lastDayOfMonth(prev) }
          : period === 'anio'
            ? { from: `${year}-01-01`, to: today }
            : { from: '2000-01-01', to: today };

    // Balance del periodo ANTERIOR por proyecto (para la comparación ▲/▼).
    const prevPredicate =
      period === 'mes'
        ? (mm: string) => mm.startsWith(prev)
        : period === 'mesPasado'
          ? (mm: string) => mm.startsWith(prevMonthKey(prev))
          : period === 'anio'
            ? (mm: string) => mm.startsWith(String(Number(year) - 1))
            : () => false; // 'todo' → sin comparación
    const prevNet = new Map<string, number>();
    for (const r of rows) {
      if (prevPredicate(r.month)) prevNet.set(r.projectId, (prevNet.get(r.projectId) ?? 0) + (r.inflow - r.outflow));
    }

    return { inflow, outflow, labels, inAgg, outAgg, netAgg, projects, range, prevNet };
  }, [rows, monthKey, period, trendTx, today]);

  const balance = inflow - outflow;
  const pLabel = periodLabelOf(period);
  const detail = detailId ? projects.find((p) => p.projectId === detailId) ?? null : null;

  return (
    <section className="fin-block fin-stats">
      <div className="fin-stats-topbar">
        <span className="fin-gen-cap">General</span>
        <Dropdown
          value={period}
          options={PERIODS}
          onChange={(v) => setPeriod(v as Period)}
          ariaLabel="Periodo"
          align="right"
        />
      </div>

      <div className="fin-general">
        <GenTile label="Balance" value={balance} series={netAgg} labels={labels} tone="accent" numClass={balance >= 0 ? 'fin-pos' : 'fin-neg'} hero />
        <GenTile label="Ingresos" value={inflow} series={inAgg} labels={labels} tone="accent" numClass="fin-pos" />
        <GenTile label="Gastos" value={outflow} series={outAgg} labels={labels} tone="muted" numClass="fin-neg" />
      </div>

      <p className="fin-stats-sub">Balance por proyecto</p>
      {projects.length === 0 ? (
        <p className="muted">Sin movimientos por proyecto en {pLabel}.</p>
      ) : (
        <div className="ptrend">
          {projects.map((p) => (
            <button key={p.projectId} type="button" className="ptrend-row ptrend-click" onClick={() => setDetailId(p.projectId)}>
              <div className="ptrend-head">
                <span className="ptrend-label">{p.label}</span>
                <span className={`ptrend-val ${p.net >= 0 ? 'fin-pos' : 'fin-neg'}`}>
                  {money(p.net, { compact: true })}
                </span>
              </div>
              <MiniMountain labels={labels} values={p.netSeries} tone={p.net >= 0 ? 'accent' : 'muted'} />
            </button>
          ))}
        </div>
      )}

      <Modal open={detail !== null} onClose={() => setDetailId(null)} eyebrow="Proyecto" title={detail?.label ?? ''}>
        {detail && (
          <ProjectDetail
            proj={detail}
            labels={labels}
            periodLabel={pLabel}
            from={range.from}
            to={range.to}
            prevNet={period === 'todo' ? null : (prevNet.get(detail.projectId) ?? 0)}
            recent={recent.filter((m) => m.projectId === detail.projectId)}
          />
        )}
      </Modal>
    </section>
  );
}

type Extras = Awaited<ReturnType<typeof getProjectExtrasAction>>;

function ProjectDetail({
  proj,
  labels,
  periodLabel,
  from,
  to,
  prevNet,
  recent,
}: {
  proj: Proj;
  labels: string[];
  periodLabel: string;
  from: string;
  to: string;
  prevNet: number | null;
  recent: RecentMov[];
}) {
  const [extras, setExtras] = useState<Extras | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setExtras(null);
    getProjectExtrasAction({ projectId: proj.projectId, from, to })
      .then((x) => {
        if (alive) {
          setExtras(x);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [proj.projectId, from, to]);

  const margen = proj.inflow > 0 ? Math.round((proj.net / proj.inflow) * 100) : null;
  // Comparación vs periodo anterior.
  let delta: { up: boolean; text: string } | null = null;
  if (prevNet !== null) {
    if (prevNet === 0) {
      if (proj.net !== 0) delta = { up: proj.net > 0, text: 'nuevo' };
    } else {
      const pct = Math.round(((proj.net - prevNet) / Math.abs(prevNet)) * 100);
      delta = { up: pct >= 0, text: `${pct >= 0 ? '+' : ''}${pct}% vs. periodo anterior` };
    }
  }

  return (
    <div className="pd">
      <p className="pd-period">{periodLabel}</p>
      <div className="pd-cells">
        <div className="pd-cell">
          <span className="pd-k">Ingresos</span>
          <span className="pd-v fin-pos">{money(proj.inflow, { compact: true })}</span>
        </div>
        <div className="pd-cell">
          <span className="pd-k">Gastos</span>
          <span className="pd-v fin-neg">{money(proj.outflow, { compact: true })}</span>
        </div>
        <div className="pd-cell">
          <span className="pd-k">Balance</span>
          <span className={`pd-v ${proj.net >= 0 ? 'fin-pos' : 'fin-neg'}`}>{money(proj.net, { compact: true })}</span>
        </div>
      </div>
      <p className="pd-meta">
        {proj.movements} {proj.movements === 1 ? 'movimiento' : 'movimientos'}
        {margen !== null ? ` · margen ${margen}%` : ''}
        {delta && (
          <em className={delta.up ? 'fin-pos' : 'fin-neg'}>
            {' · '}
            {delta.up ? '▲' : '▼'} {delta.text}
          </em>
        )}
      </p>

      <p className="pd-sub">Tendencia</p>
      <MiniMountain labels={labels} values={proj.netSeries} tone={proj.net >= 0 ? 'accent' : 'muted'} />

      {loading ? (
        <p className="muted pd-loading">Cargando detalle…</p>
      ) : (
        <>
          {extras && extras.topCategorias.length > 0 && (
            <>
              <p className="pd-sub">Top categorías de gasto</p>
              <ul className="pd-bars">
                {extras.topCategorias.map((c) => (
                  <li key={c.category} className="pd-bar">
                    <span className="pd-bar-name">{c.category}</span>
                    <span className="pd-bar-val fin-neg">{money(c.amount, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {extras && extras.topEtiquetas.length > 0 && (
            <>
              <p className="pd-sub">Etiquetas</p>
              <ul className="pd-bars">
                {extras.topEtiquetas.map((t) => (
                  <li key={t.name} className="pd-bar">
                    <span className="pd-bar-name">{t.name}</span>
                    <span className="pd-bar-val">{money(t.amount, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {extras && extras.metas.length > 0 && (
            <>
              <p className="pd-sub">Metas de dinero</p>
              <div className="pd-goals">
                {extras.metas.map((g) => {
                  const pct = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
                  return (
                    <div key={g.goalId} className="pd-goal">
                      <div className="pd-goal-head">
                        <span className="pd-goal-title">{g.title}</span>
                        <span className="pd-goal-val">
                          {money(g.currentValue * 100, { compact: true })} / {money(g.targetValue * 100, { compact: true })}
                        </span>
                      </div>
                      <div className="pd-goal-track">
                        <div className="pd-goal-fill" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {extras && extras.recurrentes.length > 0 && (
            <>
              <p className="pd-sub">Recurrentes</p>
              <ul className="pd-movs">
                {extras.recurrentes.map((r) => (
                  <li key={r.id} className="pd-mov">
                    <span className="pd-mov-title">
                      {r.title}
                      {r.vencido && <span className="pd-due">vencido</span>}
                    </span>
                    <span className="pd-mov-day">{r.nextDueOn}</span>
                    <span className={`pd-mov-amt ${r.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
                      {r.direction === 'in' ? '+' : '−'}
                      {money(r.amount, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <p className="pd-sub">Últimos movimientos</p>
      {recent.length === 0 ? (
        <p className="muted">Sin movimientos recientes de este proyecto.</p>
      ) : (
        <ul className="pd-movs">
          {recent.slice(0, 8).map((m) => (
            <li key={m.id} className="pd-mov">
              <span className="pd-mov-title">{m.title}</span>
              <span className="pd-mov-day">{m.occurredOn}</span>
              <span className={`pd-mov-amt ${m.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
                {m.direction === 'in' ? '+' : '−'}
                {money(m.baseAmountMinor, { compact: true })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/proyectos/${proj.projectId}`} className="pd-link">
        Ver el proyecto completo →
      </Link>
    </div>
  );
}

function GenTile({
  label,
  value,
  series,
  labels,
  tone,
  numClass,
  hero = false,
}: {
  label: string;
  value: number;
  series: number[];
  labels: string[];
  tone: 'accent' | 'muted';
  numClass: string;
  hero?: boolean;
}) {
  return (
    <div className={`fin-gen-tile${hero ? ' hero' : ''}`}>
      <span className="fin-gen-k">{label}</span>
      <span className={`fin-gen-v ${numClass}`}>{money(value, { compact: true })}</span>
      <MiniMountain labels={labels} values={series} tone={tone} />
    </div>
  );
}
