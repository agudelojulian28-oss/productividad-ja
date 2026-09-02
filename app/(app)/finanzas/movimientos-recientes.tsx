'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { money } from '@/lib/format';
import { listMovimientosAction } from '@/app/actions/finance';
import { Modal } from '../modal';
import { EditMovimiento } from './edit-movimiento';
import { TagChips, type TagOption } from './tags-ui';
import { DateField } from '../date-picker';
import { Dropdown } from '../dropdown';

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

const PAGE = 15; // movimientos visibles antes de "Ver más"

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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [editing, setEditing] = useState<MovRow | null>(null);
  const [limit, setLimit] = useState(PAGE);
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

  const shown = base
    .filter((r) => dir === 'all' || r.direction === dir)
    .filter((r) => !tagFilter || r.tagIds.includes(tagFilter));

  // Al cambiar de filtro/rango, vuelve a mostrar solo la primera página.
  useEffect(() => setLimit(PAGE), [dir, tagFilter, base]);
  const visible = shown.slice(0, limit);
  const restantes = shown.length - visible.length;

  // Opciones del filtro de etiquetas, agrupadas por proyecto (ADR-029). Solo se
  // listan las etiquetas que están en uso en los movimientos cargados.
  const tagOptions = useMemo(() => {
    const projName = new Map(projects.map((p) => [p.id, p.title] as const));
    const used = new Set(base.flatMap((r) => r.tagIds));
    const inUse = tags.filter((t) => used.has(t.id));
    const sorted = [...inUse].sort(
      (a, b) =>
        (projName.get(a.projectId) ?? '').localeCompare(projName.get(b.projectId) ?? '') ||
        a.name.localeCompare(b.name),
    );
    return [
      { v: '', label: 'Todas las etiquetas' },
      ...sorted.map((t) => ({ v: t.id, label: t.name, group: projName.get(t.projectId) ?? 'Sin proyecto', dot: t.color })),
    ];
  }, [tags, projects, base]);

  return (
    <div className="mov-wrap">
      <div className="mov-filters">
        <div className="mov-filters-top">
          <span className="mov-filters-k">Rango</span>
          <Dropdown
            value={preset}
            options={PRESETS.map((p) => ({ v: p.v, label: p.label }))}
            onChange={(v) => applyPreset(v as Preset)}
            ariaLabel="Rango de fechas"
          />
          {tagOptions.length > 1 && (
            <>
              <span className="mov-filters-k">Etiqueta</span>
              <Dropdown
                value={tagFilter ?? ''}
                options={tagOptions}
                onChange={(v) => setTagFilter(v || null)}
                ariaLabel="Filtrar por etiqueta"
              />
            </>
          )}
        </div>

        {preset === 'custom' && (
          <div className="mov-range">
            <div className="mov-range-field">
              Desde
              <DateField value={from} onChange={setFrom} max={to} today={today} ariaLabel="Desde" />
            </div>
            <div className="mov-range-field">
              Hasta
              <DateField value={to} onChange={setTo} min={from} max={today} today={today} ariaLabel="Hasta" />
            </div>
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
          {base.length === 0
            ? 'No hay movimientos en este rango.'
            : 'Ningún movimiento coincide con el filtro.'}
        </p>
      ) : (
        <div className="mov-list">
          {visible.map((m) => (
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
          {restantes > 0 && (
            <button type="button" className="btn-ghost mov-more" onClick={() => setLimit((l) => l + PAGE)}>
              Ver más ({restantes} {restantes === 1 ? 'movimiento' : 'movimientos'})
            </button>
          )}
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
