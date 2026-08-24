'use client';

import { useId, useState } from 'react';
import { money } from '@/lib/format';
import type { SerieMes } from '@/core/finance/queries';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesCorto(month: string): string {
  const mm = Number(month.slice(5, 7));
  return MESES[mm - 1] ?? month.slice(5, 7);
}

type View = 'circular' | 'montana' | 'tabla';
type Proj = { label: string; value: number };

const W = 320;
const H = 168;
const padTop = 24;
const padBottom = 24;
const plotH = H - padTop - padBottom;

// Paleta categórica para proyectos (tonos distintos sobre fondo oscuro).
const PALETTE = ['#ff7a45', '#3bc9db', '#4dabf7', '#9775fa', '#51cf66', '#ffd43b', '#f783ac', '#a9e34b'];

/**
 * Flujo de caja (balance) con vistas conmutables:
 *  · Montaña  — área del balance por mes con degradado (principal).
 *  · Línea    — la misma serie como línea.
 *  · Circular — dona del ingreso por proyecto, con el balance al centro y color por proyecto.
 *  · Tabla    — alternativa accesible (mes × ingresos/gastos/balance).
 */
export function CashflowChart({
  serie,
  porProyecto,
  gastosPorProyecto = [],
  balanceMinor,
}: {
  serie: SerieMes[];
  porProyecto: Proj[];
  gastosPorProyecto?: Proj[];
  balanceMinor: number;
}) {
  const [view, setView] = useState<View>('circular');
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState({ balance: true, ingresos: false, gastos: false });
  const [donutMode, setDonutMode] = useState<'in' | 'out'>('in');
  const gradId = useId();

  if (serie.length === 0) {
    return <p className="muted">Aún no hay movimientos para el gráfico.</p>;
  }

  const slot = W / serie.length;

  function pick(v: View) {
    setHover(null);
    setView(v);
  }

  const tabs: { v: View; label: string }[] = [
    { v: 'circular', label: 'Circular' },
    { v: 'montana', label: 'Montaña' },
    { v: 'tabla', label: 'Tabla' },
  ];

  return (
    <div className="fin-chart-wrap">
      <div className="seg chart-seg" role="tablist" aria-label="Vista del gráfico">
        {tabs.map((t) => (
          <button
            key={t.v}
            type="button"
            role="tab"
            aria-selected={view === t.v}
            className={`seg-btn${view === t.v ? ' seg-on' : ''}`}
            onClick={() => pick(t.v)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'tabla' && <CashTable serie={serie} />}

      {view === 'circular' && (
        <Donut
          ingresos={porProyecto}
          gastos={gastosPorProyecto}
          mode={donutMode}
          setMode={(m) => {
            setHover(null);
            setDonutMode(m);
          }}
          balanceMinor={balanceMinor}
          hover={hover}
          setHover={setHover}
        />
      )}

      {view === 'montana' && (
        <figure className="fin-chart" style={{ position: 'relative' }}>
          <div className="cash-series" role="group" aria-label="Series del gráfico">
            {([
              { k: 'balance', label: 'Balance', color: 'var(--accent)' },
              { k: 'ingresos', label: 'Ingresos', color: 'var(--positive)' },
              { k: 'gastos', label: 'Gastos', color: 'var(--negative)' },
            ] as const).map((s) => (
              <button
                key={s.k}
                type="button"
                className={`cash-serie${show[s.k] ? ' cash-serie-on' : ''}`}
                aria-pressed={show[s.k]}
                onClick={() => setShow((prev) => ({ ...prev, [s.k]: !prev[s.k] }))}
              >
                <i className="chart-dot" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Ingresos, gastos y balance por mes"
            style={{ display: 'block' }}
            onMouseLeave={() => setHover(null)}
          >
            <MultiSeries serie={serie} slot={slot} gradId={gradId} hover={hover} show={show} />

            {serie.map((s, i) => (
              <rect
                key={`hit-${s.month}`}
                x={slot * i}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              />
            ))}
            {serie.map((s, i) => (
              <text
                key={`m-${s.month}`}
                x={slot * i + slot / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill={hover === i ? 'var(--text)' : 'var(--text-subtle)'}
              >
                {mesCorto(s.month)}
              </text>
            ))}
          </svg>

          {hover !== null && serie[hover] && (
            <div
              className="chart-tip"
              style={{ left: `${((slot * hover + slot / 2) / W) * 100}%` }}
              role="status"
            >
              <span className="chart-tip-m">{mesCorto(serie[hover]!.month)}</span>
              <span className="chart-tip-row">
                <i className="chart-dot" style={{ background: 'var(--positive)' }} />
                {money(serie[hover]!.inflowMinor, { compact: true })}
              </span>
              <span className="chart-tip-row">
                <i className="chart-dot" style={{ background: 'var(--negative)' }} />
                {money(serie[hover]!.outflowMinor, { compact: true })}
              </span>
              <span
                className={`chart-tip-net ${serie[hover]!.netMinor >= 0 ? 'fin-pos' : 'fin-neg'}`}
              >
                Balance {money(serie[hover]!.netMinor, { compact: true })}
              </span>
            </div>
          )}
        </figure>
      )}
    </div>
  );
}

/** Suaviza una polilínea con curvas de Bézier (Catmull-Rom). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Líneas de balance/ingresos/gastos por mes (según `show`), con escala compartida.
 *  El balance lleva área con degradado; ingresos/gastos son líneas. */
function MultiSeries({
  serie,
  slot,
  gradId,
  hover,
  show,
}: {
  serie: SerieMes[];
  slot: number;
  gradId: string;
  hover: number | null;
  show: { balance: boolean; ingresos: boolean; gastos: boolean };
}) {
  // Escala sobre las series visibles (siempre incluye 0; balance puede ser negativo).
  const vals: number[] = [0];
  for (const s of serie) {
    if (show.balance) vals.push(s.netMinor);
    if (show.ingresos) vals.push(s.inflowMinor);
    if (show.gastos) vals.push(s.outflowMinor);
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const y = (v: number) => padTop + plotH * (1 - (v - min) / range);
  const x = (i: number) => slot * i + slot / 2;
  const bottom = padTop + plotH;
  const zeroY = y(0);

  const linePts = (pick: (s: SerieMes) => number): [number, number][] =>
    serie.map((s, i) => [x(i), y(pick(s))]);
  const balanceLine = smoothPath(linePts((s) => s.netMinor));
  const balanceArea = `${balanceLine} L${x(serie.length - 1)},${bottom} L${x(0)},${bottom} Z`;

  const only = [show.balance, show.ingresos, show.gastos].filter(Boolean).length === 1;

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {min < 0 && (
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
      )}

      {show.gastos && (
        <path d={smoothPath(linePts((s) => s.outflowMinor))} fill="none" stroke="var(--negative)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      )}
      {show.ingresos && (
        <path d={smoothPath(linePts((s) => s.inflowMinor))} fill="none" stroke="var(--positive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      )}
      {show.balance && (
        <>
          <path d={balanceArea} fill={`url(#${gradId})`} />
          <path d={balanceLine} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* Puntos + etiqueta solo cuando hay UNA serie (para no saturar). */}
      {only &&
        serie.map((s, i) => {
          const v = show.balance ? s.netMinor : show.ingresos ? s.inflowMinor : s.outflowMinor;
          const color = show.balance ? 'var(--accent)' : show.ingresos ? 'var(--positive)' : 'var(--negative)';
          return (
            <g key={s.month}>
              <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
              {(hover === i || hover === null) && (
                <text x={x(i)} y={y(v) - 9} textAnchor="middle" fontSize={9} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(v, { compact: true })}
                </text>
              )}
            </g>
          );
        })}

      {/* Con varias series, solo un punto en el mes con hover. */}
      {!only &&
        hover !== null &&
        serie[hover] && (
          <>
            {show.balance && <circle cx={x(hover)} cy={y(serie[hover]!.netMinor)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
            {show.ingresos && <circle cx={x(hover)} cy={y(serie[hover]!.inflowMinor)} r={4} fill="var(--positive)" stroke="var(--surface)" strokeWidth={2} />}
            {show.gastos && <circle cx={x(hover)} cy={y(serie[hover]!.outflowMinor)} r={4} fill="var(--negative)" stroke="var(--surface)" strokeWidth={2} />}
          </>
        )}
    </>
  );
}

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, R, a0);
  const [x1, y1] = polar(cx, cy, R, a1);
  const [x2, y2] = polar(cx, cy, r, a1);
  const [x3, y3] = polar(cx, cy, r, a0);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} A${r},${r} 0 ${large} 0 ${x3.toFixed(1)},${y3.toFixed(1)} Z`;
}

/** Dona: ingresos o gastos por proyecto (color por proyecto) con el balance al centro.
 *  Toggle Ingresos/Gastos para ver la composición sin perder el balance. */
function Donut({
  ingresos,
  gastos,
  mode,
  setMode,
  balanceMinor,
  hover,
  setHover,
}: {
  ingresos: Proj[];
  gastos: Proj[];
  mode: 'in' | 'out';
  setMode: (m: 'in' | 'out') => void;
  balanceMinor: number;
  hover: number | null;
  setHover: (n: number | null) => void;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const R = 92;
  const r = 58;

  const toggle = (
    <div className="cash-series donut-toggle" role="group" aria-label="Ingresos o gastos">
      <button type="button" className={`cash-serie${mode === 'in' ? ' cash-serie-on' : ''}`} aria-pressed={mode === 'in'} onClick={() => setMode('in')}>
        <i className="chart-dot" style={{ background: 'var(--positive)' }} /> Ingresos
      </button>
      <button type="button" className={`cash-serie${mode === 'out' ? ' cash-serie-on' : ''}`} aria-pressed={mode === 'out'} onClick={() => setMode('out')}>
        <i className="chart-dot" style={{ background: 'var(--negative)' }} /> Gastos
      </button>
    </div>
  );

  const items = (mode === 'in' ? ingresos : gastos).filter((p) => p.value > 0);
  if (items.length === 0) {
    return (
      <div className="donut-block">
        {toggle}
        <p className="muted donut-empty">
          Sin {mode === 'in' ? 'ingresos' : 'gastos'} por proyecto este mes.
        </p>
      </div>
    );
  }

  const total = items.reduce((a, p) => a + p.value, 0);
  let a0 = -Math.PI / 2;
  const segs = items.map((p, i) => {
    const frac = p.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const single = items.length === 1;
    const d = single ? '' : arcPath(cx, cy, R, r, a0, a1 - 0.0001);
    a0 = a1;
    return { ...p, color: PALETTE[i % PALETTE.length]!, d, frac, single };
  });

  return (
    <div className="donut-block">
      {toggle}
      <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="donut-svg" role="img" aria-label={`${mode === 'in' ? 'Ingresos' : 'Gastos'} por proyecto y balance`}>
        {segs.map((s, i) =>
          s.single ? (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={(R + r) / 2}
              fill="none"
              stroke={s.color}
              strokeWidth={R - r}
            />
          ) : (
            <path
              key={i}
              d={s.d}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
              opacity={hover === null || hover === i ? 1 : 0.35}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ),
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="donut-center-k">
          Balance
        </text>
        <text
          x={cx}
          y={cy + 17}
          textAnchor="middle"
          className="donut-center-v"
          fill={balanceMinor >= 0 ? 'var(--positive)' : 'var(--negative)'}
        >
          {money(balanceMinor, { compact: true })}
        </text>
      </svg>
      <ul className="donut-legend">
        {segs.map((s, i) => (
          <li
            key={i}
            className="donut-leg"
            style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="chart-dot" style={{ background: s.color }} />
            <span className="donut-leg-name">{s.label}</span>
            <span className="donut-leg-val">
              {money(s.value, { compact: true })}{' '}
              <em>{Math.round(s.frac * 100)}%</em>
            </span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}

/** Alternativa en tabla (accesibilidad dataviz): mes × ingresos/gastos/balance. */
function CashTable({ serie }: { serie: SerieMes[] }) {
  const tot = serie.reduce(
    (a, s) => ({
      inflowMinor: a.inflowMinor + s.inflowMinor,
      outflowMinor: a.outflowMinor + s.outflowMinor,
      netMinor: a.netMinor + s.netMinor,
    }),
    { inflowMinor: 0, outflowMinor: 0, netMinor: 0 },
  );
  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col" className="num">Ingresos</th>
            <th scope="col" className="num">Gastos</th>
            <th scope="col" className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {serie.map((s) => (
            <tr key={s.month}>
              <th scope="row">{mesCorto(s.month)}</th>
              <td className="num fin-pos">{money(s.inflowMinor, { compact: true })}</td>
              <td className="num fin-neg">{money(s.outflowMinor, { compact: true })}</td>
              <td className={`num ${s.netMinor >= 0 ? 'fin-pos' : 'fin-neg'}`}>
                {money(s.netMinor, { compact: true })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num fin-pos">{money(tot.inflowMinor, { compact: true })}</td>
            <td className="num fin-neg">{money(tot.outflowMinor, { compact: true })}</td>
            <td className={`num ${tot.netMinor >= 0 ? 'fin-pos' : 'fin-neg'}`}>
              {money(tot.netMinor, { compact: true })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
