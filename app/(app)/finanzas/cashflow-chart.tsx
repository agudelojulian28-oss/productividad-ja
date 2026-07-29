import { money } from '@/lib/format';
import type { SerieMes } from '@/core/finance/queries';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesCorto(month: string): string {
  const mm = Number(month.slice(5, 7));
  return MESES[mm - 1] ?? month.slice(5, 7);
}

/** Flujo de caja neto por mes. Serie única (neto); barra hacia arriba = positivo
 *  (verde), hacia abajo = negativo (rojo), con línea cero neutra. Etiqueta directa
 *  por barra: con ≤ 6 meses no hace falta leyenda ni tooltip. */
export function CashflowChart({ serie }: { serie: SerieMes[] }) {
  if (serie.length === 0) {
    return <p className="muted">Aún no hay movimientos para el gráfico.</p>;
  }

  const W = 320;
  const H = 150;
  const padTop = 22;
  const padBottom = 22;
  const plotH = H - padTop - padBottom;
  const slot = W / serie.length;
  const barW = Math.min(34, slot * 0.5);

  const nets = serie.map((s) => s.netMinor);
  const posMax = Math.max(0, ...nets);
  const negMax = Math.max(0, ...nets.map((v) => -v));
  const total = posMax + negMax || 1;
  const zeroY = padTop + plotH * (posMax / total);

  return (
    <figure className="fin-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Flujo de caja neto por mes"
        style={{ display: 'block' }}
      >
        {/* línea cero */}
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
            <g key={s.month}>
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
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-subtle)">
                {mesCorto(s.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
