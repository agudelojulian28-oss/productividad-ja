'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../modal';
import { TimeField } from '../date-picker';
import { createHealthItemAction, updateHealthItemAction, deleteHealthItemAction } from '@/app/actions/health';
import type { HealthItemRow, HealthKind, HealthSection } from '@/core/health/ports';
import { WEEKDAY_SHORT, WEEKDAY_LONG, childrenOf } from '@/core/health/plan';

export type Fields = { time?: boolean; duration?: boolean; weekdays?: boolean; trackable?: boolean };
export type GroupConfig = {
  section: HealthSection;
  kind: HealthKind;
  title: string;
  hint?: string;
  addLabel: string;
  empty: string;
  fields: Fields;
  numbered?: boolean;
  sortByTime?: boolean;
  child?: { kind: HealthKind; label: string; addLabel: string; fields: Fields };
};

type Draft = {
  title: string;
  detail: string;
  timeOfDay: string;
  durationMin: string;
  weekdays: number[]; // vacío = todos los días
  trackable: boolean;
  reviewed: boolean;
};

const fmtDays = (wd: number[] | null) =>
  !wd || wd.length === 0 || wd.length === 7 ? 'Todos los días' : [...wd].sort().map((d) => WEEKDAY_SHORT[d - 1]).join(' · ');

// ── Modal de crear/editar ────────────────────────────────────────────────────
function ItemModal({
  open,
  onClose,
  title,
  fields,
  initial,
  onSave,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: Fields;
  initial: HealthItemRow | null;
  onSave: (d: Draft) => void;
  pending: boolean;
  error: string | null;
}) {
  const uid = useId();
  const [d, setD] = useState<Draft>(() => ({
    title: initial?.title ?? '',
    detail: initial?.detail ?? '',
    timeOfDay: initial?.timeOfDay ?? '',
    durationMin: initial?.durationMin ? String(initial.durationMin) : '',
    weekdays: initial?.weekdays ?? [],
    trackable: initial?.trackable ?? Boolean(fields.trackable),
    reviewed: false,
  }));
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleDay = (n: number) =>
    set('weekdays', d.weekdays.includes(n) ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n]);

  function submit() {
    if (!d.title.trim()) {
      setTitleErr('Ponle un nombre.');
      return;
    }
    setTitleErr(null);
    onSave(d);
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="Salud" title={title}>
      <div className="sl-form">
        <label className="cal-field-label" htmlFor={`${uid}-t`}>
          Nombre
          <input
            id={`${uid}-t`}
            className="field"
            value={d.title}
            maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            aria-invalid={titleErr ? true : undefined}
            aria-describedby={titleErr ? `${uid}-terr` : undefined}
          />
        </label>
        {titleErr && (
          <p id={`${uid}-terr`} className="error-text">
            {titleErr}
          </p>
        )}
        <label className="cal-field-label" htmlFor={`${uid}-d`}>
          Detalle <span className="muted">(opcional)</span>
          <textarea
            id={`${uid}-d`}
            className="field"
            rows={3}
            value={d.detail}
            maxLength={2000}
            onChange={(e) => set('detail', e.target.value)}
          />
        </label>
        {(fields.time || fields.duration) && (
          <div className="sl-form-row">
            {fields.time && (
              <div className="cal-field-label" style={{ flex: 1 }}>
                Hora <span className="muted">(opcional)</span>
                <TimeField value={d.timeOfDay} onChange={(v) => set('timeOfDay', v)} ariaLabel="Hora" />
              </div>
            )}
            {fields.duration && (
              <label className="cal-field-label" htmlFor={`${uid}-m`} style={{ flex: 1 }}>
                Minutos <span className="muted">(opcional)</span>
                <input
                  id={`${uid}-m`}
                  className="field"
                  inputMode="numeric"
                  value={d.durationMin}
                  onChange={(e) => set('durationMin', e.target.value.replace(/[^\d]/g, ''))}
                />
              </label>
            )}
          </div>
        )}
        {fields.weekdays && (
          <fieldset className="sl-days">
            <legend>Días</legend>
            <p className="muted sl-days-hint">Sin ninguno marcado = todos los días.</p>
            <div className="sl-days-row">
              {WEEKDAY_SHORT.map((lbl, i) => {
                const n = i + 1;
                const on = d.weekdays.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`sl-day${on ? ' on' : ''}`}
                    aria-pressed={on}
                    aria-label={WEEKDAY_LONG[i]}
                    onClick={() => toggleDay(n)}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {fields.trackable && (
          <label className="sl-toggle">
            <input type="checkbox" checked={d.trackable} onChange={(e) => set('trackable', e.target.checked)} />
            Seguimiento diario (aparece en el checklist)
          </label>
        )}
        {initial?.needsReview && (
          <label className="sl-toggle">
            <input type="checkbox" checked={d.reviewed} onChange={(e) => set('reviewed', e.target.checked)} />
            Ya lo revisé (quitar la marca “revisar”)
          </label>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="sl-form-actions">
          <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
            {pending ? '…' : 'Guardar'}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function draftToPayload(d: Draft, fields: Fields) {
  return {
    title: d.title.trim(),
    detail: d.detail.trim() || null,
    timeOfDay: fields.time ? d.timeOfDay || null : undefined,
    durationMin: fields.duration ? (d.durationMin ? Number(d.durationMin) : null) : undefined,
    weekdays: fields.weekdays ? (d.weekdays.length && d.weekdays.length < 7 ? [...d.weekdays].sort() : null) : undefined,
    trackable: fields.trackable ? d.trackable : undefined,
  };
}

// ── Lista editable de un grupo (con hijos opcionales en acordeón) ─────────────
type Editing =
  | { mode: 'new'; parentId: string | null; fields: Fields; kind: HealthKind; label: string }
  | { mode: 'edit'; item: HealthItemRow; fields: Fields; label: string }
  | null;

export function ItemGroup({ config, items }: { config: GroupConfig; items: HealthItemRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const roots = items
    .filter((i) => i.section === config.section && i.kind === config.kind && i.parentId === null && i.active)
    .sort((a, b) =>
      config.sortByTime
        ? (a.timeOfDay ?? '99').localeCompare(b.timeOfDay ?? '99') || a.sortOrder - b.sortOrder
        : a.sortOrder - b.sortOrder,
    );

  const toggleOpen = (id: string) =>
    setOpenIds((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  function save(d: Draft) {
    if (!editing) return;
    setError(null);
    start(async () => {
      const base = draftToPayload(d, editing.fields);
      const r =
        editing.mode === 'new'
          ? await createHealthItemAction({
              ...base,
              section: config.section,
              kind: editing.kind,
              parentId: editing.parentId,
              sortOrder: 100 + roots.length,
            })
          : await updateHealthItemAction({
              ...base,
              id: editing.item.id,
              ...(d.reviewed ? { needsReview: false } : {}),
            });
      if (!r.ok) {
        setError(r.message ?? 'No se pudo guardar');
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove(it: HealthItemRow) {
    if (!confirm(`¿Borrar "${it.title}"?${config.child ? ' Se borra con todo lo que tiene adentro.' : ''}`)) return;
    start(async () => {
      const r = await deleteHealthItemAction(it.id);
      if (r.ok) router.refresh();
    });
  }

  const meta = (it: HealthItemRow, f: Fields) =>
    [
      f.time && it.timeOfDay ? it.timeOfDay : null,
      it.durationMin ? `${it.durationMin} min` : null,
      f.weekdays ? fmtDays(it.weekdays) : null,
    ].filter(Boolean);

  return (
    <section className="sl-group" aria-labelledby={`g-${config.section}-${config.kind}`}>
      <div className="sl-group-head">
        <h2 id={`g-${config.section}-${config.kind}`} className="fin-h2">
          {config.title}
        </h2>
        <button
          type="button"
          className="btn-ghost sl-add"
          onClick={() =>
            setEditing({ mode: 'new', parentId: null, fields: config.fields, kind: config.kind, label: config.addLabel })
          }
        >
          + {config.addLabel}
        </button>
      </div>
      {config.hint && <p className="muted sl-group-hint">{config.hint}</p>}

      {roots.length === 0 ? (
        <p className="muted">{config.empty}</p>
      ) : (
        <ol className={`sl-items${config.numbered ? ' numbered' : ''}`}>
          {roots.map((it) => {
            const kids = config.child ? childrenOf(items, it.id) : [];
            const isOpen = openIds.has(it.id);
            const kidMin = kids.reduce((s, k) => s + (k.durationMin ?? 0), 0);
            const panelId = `p-${it.id}`;
            return (
              <li key={it.id} className="sl-item">
                <div className="sl-item-main">
                  <div className="sl-item-body">
                    <span className="sl-item-title">
                      {it.title}
                      {it.needsReview && <span className="sl-badge-review">revisar</span>}
                      {it.trackable && <span className="sl-badge-track">diario</span>}
                    </span>
                    {meta(it, config.fields).length > 0 && (
                      <span className="sl-item-meta">{meta(it, config.fields).join(' · ')}</span>
                    )}
                    {it.detail && <span className="sl-item-detail">{it.detail}</span>}
                  </div>
                  <div className="sl-item-actions">
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => setEditing({ mode: 'edit', item: it, fields: config.fields, label: config.title })}
                    >
                      Editar
                    </button>
                    <button type="button" className="linkbtn task-delete" disabled={pending} onClick={() => remove(it)}>
                      Borrar
                    </button>
                  </div>
                </div>

                {config.child && (
                  <>
                    <button
                      type="button"
                      className="sl-acc"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggleOpen(it.id)}
                    >
                      <span className={`sl-acc-chev${isOpen ? ' open' : ''}`} aria-hidden="true">
                        ›
                      </span>
                      {kids.length} {config.child.label}
                      {kids.length === 1 ? '' : 's'}
                      {kidMin > 0 ? ` · ${kidMin} min` : ''}
                    </button>
                    {isOpen && (
                      <div id={panelId} className="sl-kids">
                        {kids.length > 0 && (
                          <ol className="sl-kids-list">
                            {kids.map((k) => (
                              <li key={k.id} className="sl-kid">
                                <div className="sl-item-body">
                                  <span className="sl-item-title">
                                    {k.title}
                                    {k.needsReview && <span className="sl-badge-review">revisar</span>}
                                  </span>
                                  {(k.durationMin || k.detail) && (
                                    <span className="sl-item-meta">
                                      {[k.durationMin ? `${k.durationMin} min` : null, k.detail].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </div>
                                <div className="sl-item-actions">
                                  <button
                                    type="button"
                                    className="linkbtn"
                                    onClick={() =>
                                      setEditing({ mode: 'edit', item: k, fields: config.child!.fields, label: config.child!.label })
                                    }
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="linkbtn task-delete"
                                    disabled={pending}
                                    onClick={() => remove(k)}
                                  >
                                    Borrar
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                        <button
                          type="button"
                          className="btn-ghost sl-add-kid"
                          onClick={() =>
                            setEditing({
                              mode: 'new',
                              parentId: it.id,
                              fields: config.child!.fields,
                              kind: config.child!.kind,
                              label: config.child!.addLabel,
                            })
                          }
                        >
                          + {config.child.addLabel}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <ItemModal
          key={editing.mode === 'edit' ? editing.item.id : `new-${editing.parentId ?? 'root'}`}
          open
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          title={editing.mode === 'new' ? editing.label : `Editar · ${editing.item.title}`}
          fields={editing.fields}
          initial={editing.mode === 'edit' ? editing.item : null}
          onSave={save}
          pending={pending}
          error={error}
        />
      )}
    </section>
  );
}
