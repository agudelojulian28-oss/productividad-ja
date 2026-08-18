'use client';

import { useState, useTransition } from 'react';
import { money } from '@/lib/format';
import { listMovimientosAction } from '@/app/actions/finance';
import { Modal } from '../modal';
import { EditMovimiento } from './edit-movimiento';
import { TagChips, type TagOption } from './tags-ui';

export type MovRow = {
  id: string;
  direction: 'in' | 'out';
  baseAmountMinor: number;
  occurredOn: string; // formateada (día) para mostrar
  title: string; // descripción, o categoría, o "Ingreso/Gasto"
  areaName: string;
  receiptUrl: string | null;
  // Campos crudos para editar:
  projectId: string | null;
  category: string | null;
  description: string | null;
  amountMinor: number;
  currency: string;
  fxRate: number;
  occurredOnRaw: string; // YYYY-MM-DD
  tagIds: string[];
};

type Project = { id: string; title: string; areaId: string };
export type { TagOption };
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

// Movimientos con filtro por fechas (server-side) y por dirección (client-side).
// Al tocar una fila se abre el pop-up para editar o borrar el movimiento.
export function MovimientosRecientes({
  rows,
  today,
  projects,
  tags = [],
}: {
  rows: MovRow[];
  today: string;
  projects: Project[];
  tags?: TagOption[];
}) {
  const [base, setBase] = useState<MovRow[]>(rows);
  const [preset, setPreset] = useState<Preset>('recientes');
  const [dir, setDir] = useState<Dir>('all');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [editing, setEditing] = useState<MovRow | null>(null);
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
    if (p === 'custom') return;
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
            <button key={m.id} type="button" className="mov-row" onClick={() => setEditing(m)}>
              <span className={`mov-thumb mov-thumb-${m.direction}`}>
                {m.receiptUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.receiptUrl} alt="comprobante" />
                ) : (
                  <span className="mov-thumb-empty" aria-hidden="true">
                    {m.direction === 'in' ? '↘' : '↗'}
                  </span>
                )}
              </span>
              <span className="mov-body">
                <span className="mov-title">{m.title}</span>
                <span className="mov-meta">
                  {m.areaName} · {m.occurredOn}
                  {m.receiptUrl ? ' · 📎' : ''}
                </span>
                {m.tagIds.length > 0 && <TagChips tagIds={m.tagIds} catalog={tags} />}
              </span>
              <span className={`mov-amt ${m.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
                {m.direction === 'in' ? '+' : '−'}
                {money(m.baseAmountMinor, { compact: true })}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        eyebrow="Finanzas"
        title="Editar movimiento"
      >
        {editing && (
          <EditMovimiento row={editing} projects={projects} tags={tags} onClose={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  );
}
