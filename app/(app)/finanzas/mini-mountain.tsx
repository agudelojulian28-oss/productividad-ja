'use client';

import { useId, useState } from 'react';
import { money } from '@/lib/format';

// Sparkline de "montaña" (área) por mes para un proyecto. Una sola serie → un solo
// tono (dataviz): naranja para ingresos, neutro para gastos. Con hover por punto.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (m: string) => MESES[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7);

const W = 240;
const H = 44;
const PAD = 4;

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

export function MiniMountain({
  months,
  values,
  tone = 'accent',
}: {
  months: string[];
  values: number[];
  tone?: 'accent' | 'muted';
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const max = Math.max(1, ...values);
  const x = (i: number) => (n <= 1 ? W / 2 : PAD + ((W - 2 * PAD) * i) / (n - 1));
  const y = (v: number) => PAD + (H - 2 * PAD) * (1 - v / max);
  const bottom = H - PAD;
  const pts = values.map((v, i): [number, number] => [x(i), y(v)]);
  const line = smoothPath(pts);
  const areaD = n > 0 ? `${line} L${x(n - 1)},${bottom} L${x(0)},${bottom} Z` : '';
  const color = tone === 'accent' ? 'var(--accent)' : 'var(--text-muted)';
  const aria = months
    .map((m, i) => `${mesCorto(m)} ${money(values[i] ?? 0, { compact: true })}`)
    .join(', ');

  return (
    <div className="mini-mtn">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tendencia mensual: ${aria}`}
        style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {areaD && <path d={areaD} fill={`url(#${gid})`} />}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hover !== null && pts[hover] && (
          <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={3.2} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
        )}
        {/* zonas de hover (transparentes) */}
        {values.map((_, i) => (
          <rect
            key={i}
            x={n <= 1 ? 0 : x(i) - (W - 2 * PAD) / (2 * (n - 1))}
            y={0}
            width={n <= 1 ? W : (W - 2 * PAD) / (n - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && months[hover] && (
        <span className="mini-mtn-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
          {mesCorto(months[hover]!)} · {money(values[hover] ?? 0, { compact: true })}
        </span>
      )}
    </div>
  );
}
