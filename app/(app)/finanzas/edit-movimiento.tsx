'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { updateMovimientoAction, deleteMovimientoAction } from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { SegSelect } from '../seg-select';
import type { MovRow } from './movimientos-recientes';
import { TagPicker, type TagOption } from './tags-ui';

type Project = { id: string; title: string; areaId: string };

/** Edición de un movimiento existente (y borrado), en el pop-up. Misma semántica
 *  que registrar; recalcula el base COP en el servidor. */
export function EditMovimiento({
  row,
  projects,
  tags = [],
  onClose,
}: {
  row: MovRow;
  projects: Project[];
  tags?: TagOption[];
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<'out' | 'in'>(row.direction);
  const [monto, setMonto] = useState(String(row.amountMinor / 100));
  const [currency, setCurrency] = useState<'COP' | 'USD'>(row.currency === 'USD' ? 'USD' : 'COP');
  const [fx, setFx] = useState(row.fxRate && row.currency === 'USD' ? String(row.fxRate) : '');
  const [projectId, setProjectId] = useState(row.projectId ?? projects[0]?.id ?? '');
  const [category, setCategory] = useState(row.category ?? '');
  const [descripcion, setDescripcion] = useState(row.description ?? '');
  const [occurredOn, setOccurredOn] = useState(row.occurredOnRaw);
  const [tagIds, setTagIds] = useState<string[]>(row.tagIds);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amountMinor = parseAmountToMinor(monto);
    if (!amountMinor) return setError('Monto inválido');
    const project = projects.find((p) => p.id === projectId);
    if (!project) return setError('Elige un proyecto');
    const fxRate = currency === 'USD' ? Number(fx.replace(',', '.')) : undefined;
    if (currency === 'USD' && !(fxRate && fxRate > 0)) return setError('Falta la tasa de cambio');

    startTransition(async () => {
      const res = await updateMovimientoAction({
        id: row.id,
        direction,
        amountMinor,
        currency,
        fxRate,
        projectId: project.id,
        areaId: project.areaId,
        category: category.trim() || null,
        description: descripcion.trim() || null,
        occurredOn,
        tagIds,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo guardar');
      else onClose();
    });
  }

  function onDelete() {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteMovimientoAction(row.id);
      if (!res.ok) setError(res.message ?? 'No se pudo borrar');
      else onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} className="fin-form">
      <SegSelect
        ariaLabel="Tipo de movimiento"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'out', label: 'Gasto' },
          { value: 'in', label: 'Ingreso' },
        ]}
      />

      <input
        type="text"
        inputMode="decimal"
        placeholder="Monto"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        className="field fin-amount"
        aria-label="Monto"
        autoComplete="off"
      />
      <SegSelect
        ariaLabel="Moneda"
        value={currency}
        onChange={setCurrency}
        options={[
          { value: 'COP', label: 'COP' },
          { value: 'USD', label: 'USD' },
        ]}
      />
      {currency === 'USD' && (
        <label className="cal-field-label">
          Tasa (COP por 1 USD)
          <input
            type="text"
            inputMode="decimal"
            placeholder="ej. 4000"
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            className="field"
            autoComplete="off"
          />
        </label>
      )}

      <label className="cal-field-label">
        Proyecto
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setTagIds([]); // las etiquetas son por proyecto; se limpian al cambiar
          }}
          className="field"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <label className="cal-field-label">
        Categoría (opcional)
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field"
          autoComplete="off"
        />
      </label>

      <label className="cal-field-label">
        Descripción (opcional)
        <input
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="field"
          autoComplete="off"
        />
      </label>

      <label className="cal-field-label">
        Fecha
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="field"
        />
      </label>

      <div className="cal-field-label">
        Etiquetas
        <TagPicker catalog={tags} projectId={projectId} selected={tagIds} onChange={setTagIds} />
      </div>

      {row.receiptUrl && (
        <a className="link mov-edit-receipt" href={row.receiptUrl} target="_blank" rel="noopener noreferrer">
          📎 Ver comprobante
        </a>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="mov-edit-actions">
        <button
          type="button"
          className={`btn-ghost mov-del${confirmDel ? ' mov-del-armed' : ''}`}
          onClick={onDelete}
          disabled={pending}
        >
          {confirmDel ? '¿Seguro? Borrar' : 'Borrar'}
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
