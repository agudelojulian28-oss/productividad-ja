'use client';

import { useId, useState } from 'react';
import { money } from '@/lib/format';

// Dos líneas (ingresos verde, gastos rojo) de los últimos días. Al pasar el cursor sobre
// un día, el tooltip muestra el desglose de ingresos por proyecto de ese día.
export type DayPoint = {
  date: string; // YYYY-MM-DD
  inflow: number;
  outflow: number;
  projIn: { label: string; value: number }[];
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function dayLabel(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date((y ?? 1970), (m ?? 1) - 1, d ?? 1);
  return `${DOW[dt.getDay()]} ${d} ${MESES[(m ?? 1) - 1]}`;
}

const W = 320;
const H = 120;
const PADX = 6;
const PADT = 10;
const PADB = 16;
const plotH = H - PADT - PADB;

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

export function DiaCashChart({ days }: { days: DayPoint[] }) {
  const gin = useId();
  const gout = useId();
  const [hover, setHover] = useState<number | null>(null);

  const n = days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.inflow, d.outflow)));
  const x = (i: number) => (n <= 1 ? W / 2 : PADX + ((W - 2 * PADX) * i) / (n - 1));
  const y = (v: number) => PADT + plotH * (1 - v / max);
  const bottom = PADT + plotH;

  const inPts = days.map((d, i): [number, number] => [x(i), y(d.inflow)]);
  const outPts = days.map((d, i): [number, number] => [x(i), y(d.outflow)]);
  const inLine = smoothPath(inPts);
  const outLine = smoothPath(outPts);
  const inArea = n > 0 ? `${inLine} L${x(n - 1)},${bottom} L${x(0)},${bottom} Z` : '';

  const hd = hover !== null ? days[hover] : null;

  return (
    <div className="dia-chart">
      <div className="dia-chart-legend">
        <span className="dia-leg">
          <i className="chart-dot" style={{ background: 'var(--positive)' }} /> Ingresos
        </span>
        <span className="dia-leg">
          <i className="chart-dot" style={{ background: 'var(--negative)' }} /> Gastos
        </span>
        <span className="dia-leg-note">últimos {n} días</span>
      </div>

      <div className="dia-chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Ingresos y gastos de los últimos días"
          style={{ display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gin} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--positive)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--positive)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {inArea && <path d={inArea} fill={`url(#${gin})`} />}
          <path d={outLine} fill="none" stroke="var(--negative)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <path d={inLine} fill="none" stroke="var(--positive)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

          {hover !== null && (
            <>
              <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={bottom} stroke="var(--border-strong)" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(days[hover]!.inflow)} r={3.2} fill="var(--positive)" stroke="var(--surface)" strokeWidth={1.5} />
              <circle cx={x(hover)} cy={y(days[hover]!.outflow)} r={3.2} fill="var(--negative)" stroke="var(--surface)" strokeWidth={1.5} />
            </>
          )}

          {/* zonas de hover por día */}
          {days.map((d, i) => (
            <rect
              key={d.date}
              x={n <= 1 ? 0 : x(i) - (W - 2 * PADX) / (2 * (n - 1))}
              y={0}
              width={n <= 1 ? W : (W - 2 * PADX) / (n - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </svg>

        {hd && (
          <div
            className="dia-chart-tip"
            style={{ left: `${(x(hover!) / W) * 100}%` }}
            role="status"
          >
            <span className="dia-tip-day">{dayLabel(hd.date)}</span>
            <span className="dia-tip-row fin-pos">
              Ingresos {money(hd.inflow, { compact: true })}
            </span>
            {hd.projIn.length > 0 && (
              <ul className="dia-tip-proj">
                {hd.projIn.map((p) => (
                  <li key={p.label}>
                    <span>{p.label}</span>
                    <span>{money(p.value, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            )}
            <span className="dia-tip-row fin-neg">Gastos {money(hd.outflow, { compact: true })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
