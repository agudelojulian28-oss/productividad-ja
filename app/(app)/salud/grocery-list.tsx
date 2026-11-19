'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from '../modal';
import { Dropdown } from '../dropdown';
import { money } from '@/lib/format';
import { parseAmountToMinor } from '@/lib/parse-amount';
import {
  createGroceryAction,
  updateGroceryAction,
  deleteGroceryAction,
  resetGroceriesAction,
  setMercadoProjectAction,
  syncMercadoAction,
} from '@/app/actions/health';
import type { GroceryFrequency, GroceryRow } from '@/core/health/ports';
import type { MercadoSync } from '@/lib/salud-mercado';
import { SalIcon } from './icons';

const FREQ: { v: GroceryFrequency; label: string }[] = [
  { v: 'semanal', label: 'Semanal' },
  { v: 'quincenal', label: 'Quincenal' },
  { v: 'mensual', label: 'Mensual' },
  { v: 'bimestral', label: 'Bimestral' },
  { v: 'trimestral', label: 'Trimestral' },
  { v: 'anual', label: 'Anual' },
];
const freqLabel = (f: GroceryFrequency) => FREQ.find((x) => x.v === f)?.label ?? f;

type Draft = { name: string; quantity: string; cost: string; frequency: GroceryFrequency };

function GroceryModal({
  initial,
  onClose,
  onSave,
  pending,
  error,
}: {
  initial: GroceryRow | null;
  onClose: () => void;
  onSave: (d: Draft) => void;
  pending: boolean;
  error: string | null;
}) {
  const uid = useId();
  const [d, setD] = useState<Draft>({
    name: initial?.name ?? '',
    quantity: initial?.quantity ?? '',
    cost: initial && initial.costMinor > 0 ? String(Math.round(initial.costMinor / 100)) : '',
    frequency: initial?.frequency ?? 'semanal',
  });
  const [nameErr, setNameErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  return (
    <Modal open onClose={onClose} eyebrow="Mercado" title={initial ? `Editar · ${initial.name}` : 'Nuevo ítem'}>
      <div className="sl-form">
        <label className="cal-field-label" htmlFor={`${uid}-n`}>
          Producto
          <input
            id={`${uid}-n`}
            className="field"
            value={d.name}
            maxLength={120}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={nameErr ? true : undefined}
          />
        </label>
        {nameErr && <p className="error-text">{nameErr}</p>}
        <div className="sl-form-row">
          <label className="cal-field-label" htmlFor={`${uid}-q`} style={{ flex: 1 }}>
            Cantidad <span className="muted">(opcional)</span>
            <input id={`${uid}-q`} className="field" value={d.quantity} maxLength={60} onChange={(e) => set('quantity', e.target.value)} />
          </label>
          <label className="cal-field-label" htmlFor={`${uid}-c`} style={{ flex: 1 }}>
            Precio (COP)
            <input
              id={`${uid}-c`}
              className="field"
              inputMode="decimal"
              placeholder="0"
              value={d.cost}
              onChange={(e) => set('cost', e.target.value)}
            />
          </label>
        </div>
        <div className="cal-field-label">
          Cada cuánto lo compras
          <Dropdown
            value={d.frequency}
            options={FREQ.map((f) => ({ v: f.v, label: f.label }))}
            onChange={(v) => set('frequency', v as GroceryFrequency)}
            ariaLabel="Frecuencia de compra"
          />
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="sl-form-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() => {
              if (!d.name.trim()) return setNameErr('Ponle un nombre.');
              setNameErr(null);
              onSave(d);
            }}
          >
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

export function GroceryList({
  groceries,
  mercado,
  projects,
}: {
  groceries: GroceryRow[];
  mercado: MercadoSync;
  projects: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GroceryRow | 'new' | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const activos = groceries.filter((g) => g.active);
  const comprados = activos.filter((g) => g.checked).length;
  const sinPrecio = activos.filter((g) => g.costMinor === 0).length;

  const avisar = (s: MercadoSync | null | undefined) => {
    if (!s) return;
    setAviso(
      s.synced
        ? `Gasto fijo actualizado en Finanzas: ${money(s.monthlyMinor, { compact: true })}/mes.`
        : 'Aún sin precios: el gasto fijo se crea cuando la lista tenga costo.',
    );
  };

  function save(d: Draft) {
    setError(null);
    const costMinor = d.cost.trim() ? (parseAmountToMinor(d.cost) ?? 0) : 0;
    start(async () => {
      const payload = { name: d.name.trim(), quantity: d.quantity.trim() || null, costMinor, frequency: d.frequency };
      const r = editing === 'new' ? await createGroceryAction(payload) : await updateGroceryAction({ id: (editing as GroceryRow).id, ...payload });
      if (!r.ok) {
        setError(r.message ?? 'No se pudo guardar');
        return;
      }
      avisar(r.value.sync);
      setEditing(null);
      router.refresh();
    });
  }
  function toggle(g: GroceryRow, checked: boolean) {
    start(async () => {
      await updateGroceryAction({ id: g.id, checked });
      router.refresh();
    });
  }
  function remove(g: GroceryRow) {
    if (!confirm(`¿Quitar "${g.name}" de la lista?`)) return;
    start(async () => {
      const r = await deleteGroceryAction(g.id);
      if (r.ok) avisar(r.value.sync);
      router.refresh();
    });
  }

  return (
    <section className="sl-group" aria-labelledby="g-mercado">
      <div className="sl-group-head">
        <h2 id="g-mercado" className="fin-h2">
          Lista de mercado
        </h2>
        <button type="button" className="btn-ghost sl-add" onClick={() => setEditing('new')}>
          + Agregar
        </button>
      </div>

      {/* Vínculo con Finanzas */}
      <div className={`sl-mkt${mercado.synced ? ' ok' : ''}`}>
        <span className="sl-mkt-ico" aria-hidden="true">
          {SalIcon.carrito}
        </span>
        <div className="sl-mkt-body">
          <span className="sl-mkt-k">Mercado al mes</span>
          <span className="sl-mkt-v">{money(mercado.monthlyMinor, { compact: true })}</span>
          <span className="sl-mkt-sub">
            {mercado.synced ? (
              <>
                Sincronizado como gasto fijo <strong>Mercado · dieta</strong>
                {mercado.projectTitle ? ` en ${mercado.projectTitle}` : ''}.{' '}
                <Link href="/finanzas">Ver en Finanzas →</Link>
              </>
            ) : sinPrecio === activos.length ? (
              'Ponle precio a lo que compras y se crea solo el gasto fijo en Finanzas.'
            ) : (
              'Pendiente de sincronizar con Finanzas.'
            )}
          </span>
        </div>
        <div className="sl-mkt-actions">
          {projects.length > 0 && (
            <Dropdown
              value={mercado.projectId ?? ''}
              options={[
                ...(mercado.projectId ? [] : [{ v: '', label: 'Proyecto…' }]),
                ...projects.map((p) => ({ v: p.id, label: p.title })),
              ]}
              onChange={(v) => {
                if (!v) return;
                start(async () => {
                  const r = await setMercadoProjectAction(v);
                  if (r.ok) avisar(r.value.sync);
                  router.refresh();
                });
              }}
              ariaLabel="Proyecto del gasto de mercado"
              align="right"
            />
          )}
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await syncMercadoAction();
                if (r.ok) avisar(r.value.sync);
                router.refresh();
              })
            }
          >
            Sincronizar
          </button>
        </div>
      </div>
      <p className="sl-aviso" aria-live="polite">
        {aviso}
      </p>

      {activos.length === 0 ? (
        <p className="muted">Tu lista está vacía.</p>
      ) : (
        <>
          <div className="sl-mkt-bar">
            <span className="muted">
              {comprados} de {activos.length} comprados
            </span>
            {comprados > 0 && (
              <button
                type="button"
                className="linkbtn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await resetGroceriesAction();
                    router.refresh();
                  })
                }
              >
                Nueva vuelta (desmarcar todo)
              </button>
            )}
          </div>
          <ul className="sl-gro">
            {activos.map((g) => {
              const id = `gro-${g.id}`;
              return (
                <li key={g.id} className={`sl-gro-row${g.checked ? ' on' : ''}`}>
                  <label htmlFor={id} className="sl-gro-label">
                    <input
                      id={id}
                      type="checkbox"
                      className="sl-check-input"
                      checked={g.checked}
                      onChange={(e) => toggle(g, e.target.checked)}
                    />
                    <span className="sl-check-box" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                    <span className="sl-gro-text">
                      <span className="sl-gro-name">{g.name}</span>
                      <span className="sl-gro-meta">
                        {[g.quantity, freqLabel(g.frequency)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                  <span className={`sl-gro-cost${g.costMinor === 0 ? ' none' : ''}`}>
                    {g.costMinor > 0 ? money(g.costMinor, { compact: true }) : 'sin precio'}
                  </span>
                  <div className="sl-item-actions">
                    <button type="button" className="linkbtn" onClick={() => setEditing(g)}>
                      Editar
                    </button>
                    <button type="button" className="linkbtn task-delete" disabled={pending} onClick={() => remove(g)}>
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && (
        <GroceryModal
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={save}
          pending={pending}
          error={error}
        />
      )}
    </section>
  );
}
