'use client';

import { useState, useTransition } from 'react';
import { money } from '@/lib/format';
import { listMovimientosAction } from '@/app/actions/finance';

export type MovRow = {
  id: string;
  direction: 'in' | 'out';
  baseAmountMinor: number;
  occurredOn: string; // ya formateada (día)
  title: string; // descripción, o categoría, o "Ingreso/Gasto"
  areaName: string;
  receiptUrl: string | null;
};

type Dir = 'all' | 'in' | 'out';
type Preset = 'recientes' | 'hoy' | '7d' | '30d' | 'mes' | 'custom';

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const firstOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`;

const PRESETS: { v: Preset; label: string }[] = [
  { v: 'recientes', label: 'Recientes' },
  { v: 'hoy', label: 'Hoy' },
  { v: '7d', label: '7 días' },
  { v: '30d', label: '30 días' },
  { v: 'mes', label: 'Este mes' },
  { v: 'custom', label: 'Personalizado' },
];

// Movimientos con filtro por fechas (server-side, eficiente) y por dirección
// (client-side sobre el conjunto ya traído). El agente accede a lo mismo por
// consultar(vista=movimientos, desde, hasta, direccion).
export function MovimientosRecientes({ rows, today }: { rows: MovRow[]; today: string }) {
  const [base, setBase] = useState<MovRow[]>(rows);
  const [preset, setPreset] = useState<Preset>('recientes');
  const [dir, setDir] = useState<Dir>('all');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [pending, startTransition] = useTransition();

  function rangeFor(p: Preset): { from?: string; to?: string } {
    switch (p) {
      case 'hoy':
        return { from: today, to: today };
      case '7d':
        return { from: addDays(today, -6), to: today };
      case '30d':
        return { from: addDays(today, -29), to: today };
      case 'mes':
        return { from: firstOfMonth(today), to: today };
      case 'custom':
        return { from, to };
      default:
        return {};
    }
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === 'custom') return; // espera a "Aplicar"
    if (p === 'recientes') {
      setBase(rows);
      return;
    }
    fetchRange(rangeFor(p));
  }

  function fetchRange(range: { from?: string; to?: string }) {
    startTransition(async () => {
      const res = await listMovimientosAction(range);
      setBase(res);
    });
  }

  const shown = dir === 'all' ? base : base.filter((r) => r.direction === dir);

  return (
    <div className="mov-wrap">
      <div className="mov-filters">
        <div className="seg mov-presets" role="tablist" aria-label="Rango de fechas">
          {PRESETS.map((p) => (
            <button
              key={p.v}
              type="button"
              role="tab"
              aria-selected={preset === p.v}
              className={`seg-btn${preset === p.v ? ' seg-on' : ''}`}
              onClick={() => applyPreset(p.v)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mov-range">
            <label className="mov-range-field">
              Desde
              <input type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="mov-range-field">
              Hasta
              <input type="date" className="field" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" className="btn-ghost mov-apply" disabled={pending} onClick={() => fetchRange({ from, to })}>
              {pending ? '…' : 'Aplicar'}
            </button>
          </div>
        )}
      </div>

      <div className="seg mov-seg" role="tablist" aria-label="Filtrar por tipo">
        {(['all', 'in', 'out'] as Dir[]).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={dir === d}
            className={`seg-btn${dir === d ? ' seg-on' : ''}`}
            onClick={() => setDir(d)}
          >
            {d === 'all' ? 'Todos' : d === 'in' ? 'Ingresos' : 'Gastos'}
          </button>
        ))}
      </div>

      {pending ? (
        <p className="muted mov-empty">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="muted mov-empty">
          {base.length === 0 ? 'No hay movimientos en este rango.' : `Sin ${dir === 'in' ? 'ingresos' : 'gastos'} en este rango.`}
        </p>
      ) : (
        <div className="mov-list">
          {shown.map((m) => (
            <div key={m.id} className="mov-row">
              {m.receiptUrl ? (
                <a
                  className="mov-thumb"
                  href={m.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ver comprobante"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.receiptUrl} alt="comprobante" />
                </a>
              ) : (
                <div className={`mov-thumb mov-thumb-${m.direction}`}>
                  <span className="mov-thumb-empty" aria-hidden="true">
                    {m.direction === 'in' ? '↘' : '↗'}
                  </span>
                </div>
              )}
              <div className="mov-body">
                <span className="mov-title">{m.title}</span>
                <span className="mov-meta">
                  {m.areaName} · {m.occurredOn}
                  {m.receiptUrl ? ' · 📎 comprobante' : ''}
                </span>
              </div>
              <span className={`mov-amt ${m.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
                {m.direction === 'in' ? '+' : '−'}
                {money(m.baseAmountMinor, { compact: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
