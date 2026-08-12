'use client';

import { useState } from 'react';
import { money } from '@/lib/format';
import type { SerieMes } from '@/core/finance/queries';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesCorto(month: string): string {
  const mm = Number(month.slice(5, 7));
  return MESES[mm - 1] ?? month.slice(5, 7);
}

type View = 'neto' | 'inout' | 'acum';

const W = 320;
const H = 158;
const padTop = 22;
const padBottom = 22;
const plotH = H - padTop - padBottom;

/**
 * Flujo de caja con tres vistas conmutables (el usuario elige cómo leer los datos):
 *  · Neto      — barra por mes, verde arriba / rojo abajo (polaridad).
 *  · In vs Out — barras agrupadas ingresos (verde) y gastos (rojo) por mes.
 *  · Acumulado — línea del neto acumulado (tendencia).
 * Tooltip directo al pasar el cursor/tocar; datos ya resueltos en el servidor.
 */
export function CashflowChart({ serie }: { serie: SerieMes[] }) {
  const [view, setView] = useState<View>('neto');
  const [hover, setHover] = useState<number | null>(null);

  if (serie.length === 0) {
    return <p className="muted">Aún no hay movimientos para el gráfico.</p>;
  }

  const slot = W / serie.length;

  return (
    <div className="fin-chart-wrap">
      <div className="seg chart-seg" role="tablist" aria-label="Vista del gráfico">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'neto'}
          className={`seg-btn${view === 'neto' ? ' seg-on' : ''}`}
          onClick={() => setView('neto')}
        >
          Neto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'inout'}
          className={`seg-btn${view === 'inout' ? ' seg-on' : ''}`}
          onClick={() => setView('inout')}
        >
          Ingresos vs Gastos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'acum'}
          className={`seg-btn${view === 'acum' ? ' seg-on' : ''}`}
          onClick={() => setView('acum')}
        >
          Acumulado
        </button>
      </div>

      {view === 'inout' && (
        <div className="chart-legend">
          <span className="chart-leg">
            <i className="chart-dot" style={{ background: 'var(--positive)' }} /> Ingresos
          </span>
          <span className="chart-leg">
            <i className="chart-dot" style={{ background: 'var(--negative)' }} /> Gastos
          </span>
        </div>
      )}

      <figure className="fin-chart" style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={
            view === 'neto'
              ? 'Flujo de caja neto por mes'
              : view === 'inout'
                ? 'Ingresos y gastos por mes'
                : 'Neto acumulado por mes'
          }
          style={{ display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          {view === 'neto' && <NetoBars serie={serie} slot={slot} hover={hover} />}
          {view === 'inout' && <InOutBars serie={serie} slot={slot} hover={hover} />}
          {view === 'acum' && <AcumLine serie={serie} slot={slot} hover={hover} />}

          {/* Zonas de hover/toque por mes (capturan aunque la barra sea pequeña). */}
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
            style={{
              left: `${((slot * hover + slot / 2) / W) * 100}%`,
            }}
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
              Neto {money(serie[hover]!.netMinor, { compact: true })}
            </span>
          </div>
        )}
      </figure>
    </div>
  );
}

/** Vista Neto: una barra por mes, arriba (verde) / abajo (rojo) desde la línea cero. */
function NetoBars({
  serie,
  slot,
  hover,
}: {
  serie: SerieMes[];
  slot: number;
  hover: number | null;
}) {
  const barW = Math.min(34, slot * 0.5);
  const nets = serie.map((s) => s.netMinor);
  const posMax = Math.max(0, ...nets);
  const negMax = Math.max(0, ...nets.map((v) => -v));
  const total = posMax + negMax || 1;
  const zeroY = padTop + plotH * (posMax / total);

  return (
    <>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-strong)" strokeWidth={1} />
      {serie.map((s, i) => {
        const cx = slot * i + slot / 2;
        const x = cx - barW / 2;
        const h = (Math.abs(s.netMinor) / total) * plotH;
        const positive = s.netMinor >= 0;
        const y = positive ? zeroY - h : zeroY;
        const color = positive ? 'var(--positive)' : 'var(--negative)';
        const labelY = positive ? y - 6 : y + h + 12;
        return (
          <g key={s.month} opacity={hover === null || hover === i ? 1 : 0.5}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx={4} fill={color} />
            <text
              x={cx}
              y={labelY}
              textAnchor="middle"
              fontSize={9}
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {money(s.netMinor, { compact: true })}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Vista Ingresos vs Gastos: dos barras agrupadas por mes desde una base común. */
function InOutBars({
  serie,
  slot,
  hover,
}: {
  serie: SerieMes[];
  slot: number;
  hover: number | null;
}) {
  const max = Math.max(1, ...serie.flatMap((s) => [s.inflowMinor, s.outflowMinor]));
  const baseY = padTop + plotH;
  const barW = Math.min(13, slot * 0.28);
  const gap = 3;

  return (
    <>
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="var(--border-strong)" strokeWidth={1} />
      {serie.map((s, i) => {
        const cx = slot * i + slot / 2;
        const hi = (s.inflowMinor / max) * plotH;
        const ho = (s.outflowMinor / max) * plotH;
        return (
          <g key={s.month} opacity={hover === null || hover === i ? 1 : 0.5}>
            <rect
              x={cx - barW - gap / 2}
              y={baseY - hi}
              width={barW}
              height={Math.max(hi, 1)}
              rx={3}
              fill="var(--positive)"
            />
            <rect
              x={cx + gap / 2}
              y={baseY - ho}
              width={barW}
              height={Math.max(ho, 1)}
              rx={3}
              fill="var(--negative)"
            />
          </g>
        );
      })}
    </>
  );
}

/** Vista Acumulado: línea del neto acumulado (tendencia del saldo). */
function AcumLine({
  serie,
  slot,
  hover,
}: {
  serie: SerieMes[];
  slot: number;
  hover: number | null;
}) {
  let run = 0;
  const cum = serie.map((s) => (run += s.netMinor));
  const min = Math.min(0, ...cum);
  const max = Math.max(0, ...cum);
  const range = max - min || 1;
  const y = (v: number) => padTop + plotH * (1 - (v - min) / range);
  const x = (i: number) => slot * i + slot / 2;
  const zeroY = y(0);

  const pts = cum.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${zeroY} ${pts} ${x(cum.length - 1)},${zeroY}`;

  return (
    <>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-strong)" strokeWidth={1} />
      <polygon points={area} fill="var(--accent-weak)" />
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {cum.map((v, i) => (
        <g key={serie[i]!.month}>
          <circle
            cx={x(i)}
            cy={y(v)}
            r={hover === i ? 5 : 3.5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
          {(hover === i || hover === null) && (
            <text
              x={x(i)}
              y={y(v) - 9}
              textAnchor="middle"
              fontSize={9}
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {money(v, { compact: true })}
            </text>
          )}
        </g>
      ))}
    </>
  );
}
