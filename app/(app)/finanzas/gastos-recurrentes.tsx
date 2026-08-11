'use client';

import { useState, useTransition, type FormEvent } from 'react';
import {
  createRecurringExpenseAction,
  updateRecurringExpenseAction,
  deleteRecurringExpenseAction,
} from '@/app/actions/finance';
import { parseAmountToMinor } from '@/lib/parse-amount';
import { money } from '@/lib/format';
import type { RecurringFrequency } from '@/core/finance/ports';

type Project = { id: string; title: string; areaId: string };
export type RecurRow = {
  id: string;
  projectId: string;
  amountMinor: number;
  category: string | null;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueOn: string;
};

const FREQS: { v: RecurringFrequency; label: string }[] = [
  { v: 'semanal', label: 'Semanal' },
  { v: 'quincenal', label: 'Quincenal' },
  { v: 'mensual', label: 'Mensual' },
  { v: 'bimestral', label: 'Bimestral' },
  { v: 'trimestral', label: 'Trimestral' },
  { v: 'anual', label: 'Anual' },
];
const freqLabel = (f: RecurringFrequency) => FREQS.find((x) => x.v === f)?.label ?? f;

export function GastosRecurrentes({
  projects,
  recurrentes,
  today,
}: {
  projects: Project[];
  recurrentes: RecurRow[];
  today: string;
}) {
  const [monto, setMonto] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [category, setCategory] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('mensual');
  const [nextDueOn, setNextDueOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const minor = parseAmountToMinor(monto);
    const project = projects.find((p) => p.id === projectId);
    if (!minor) return setError('Monto inválido');
    if (!project) return setError('Elige un proyecto');
    startTransition(async () => {
      const r = await createRecurringExpenseAction({
        projectId: project.id,
        areaId: project.areaId,
        amountMinor: minor,
        category: category.trim() || undefined,
        description: descripcion.trim() || undefined,
        frequency,
        nextDueOn,
      });
      if (!r.ok) setError(r.message ?? 'No se pudo crear');
      else {
        setMonto('');
        setCategory('');
        setDescripcion('');
      }
    });
  }

  return (
    <div>
      {recurrentes.length > 0 && (
        <ul className="fin-list" style={{ marginBottom: 16 }}>
          {recurrentes.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} row={r} onDone={() => setEditing(null)} />
            ) : (
              <li key={r.id} className="recur-row">
                <div className="recur-body">
                  <span className="recur-title">
                    {r.description || r.category || 'Gasto recurrente'}
                  </span>
                  <span className="recur-meta">
                    {freqLabel(r.frequency)} · próximo {r.nextDueOn}
                    {projects.find((p) => p.id === r.projectId)
                      ? ` · ${projects.find((p) => p.id === r.projectId)!.title}`
                      : ''}
                  </span>
                </div>
                <span className="recur-amt fin-neg">−{money(r.amountMinor, { compact: true })}</span>
                <div className="recur-actions">
                  <button type="button" className="linkbtn" onClick={() => setEditing(r.id)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="linkbtn task-delete"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteRecurringExpenseAction(r.id);
                      })
                    }
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={onCreate} className="fin-form">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="field"
          aria-label="Proyecto"
        >
          {projects.length === 0 && <option value="">Crea un proyecto primero</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <div className="new-task-row">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="field"
            aria-label="Monto"
            autoComplete="off"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            className="field"
            aria-label="Frecuencia"
          >
            {FREQS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Concepto (ej. arriendo, Netflix)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="field"
          aria-label="Concepto"
          autoComplete="off"
        />
        <input
          type="text"
          placeholder="Categoría (opcional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field"
          aria-label="Categoría"
          autoComplete="off"
        />
        <label className="cal-field-label">
          Próxima fecha
          <input
            type="date"
            value={nextDueOn}
            onChange={(e) => setNextDueOn(e.target.value)}
            className="field"
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Agregar gasto recurrente'}
        </button>
      </form>
    </div>
  );
}

function EditRow({ row, onDone }: { row: RecurRow; onDone: () => void }) {
  const [monto, setMonto] = useState(String(row.amountMinor / 100));
  const [descripcion, setDescripcion] = useState(row.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(row.frequency);
  const [nextDueOn, setNextDueOn] = useState(row.nextDueOn);
  const [pending, startTransition] = useTransition();

  function save() {
    const minor = parseAmountToMinor(monto);
    startTransition(async () => {
      await updateRecurringExpenseAction({
        id: row.id,
        amountMinor: minor || undefined,
        description: descripcion.trim() || null,
        frequency,
        nextDueOn,
      });
      onDone();
    });
  }

  return (
    <li className="recur-row recur-edit">
      <div className="fin-form" style={{ flex: 1 }}>
        <input
          type="text"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="field"
          aria-label="Monto"
        />
        <input
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="field"
          placeholder="Concepto"
        />
        <div className="new-task-row">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            className="field"
            aria-label="Frecuencia"
          >
            {FREQS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={nextDueOn}
            onChange={(e) => setNextDueOn(e.target.value)}
            className="field"
            aria-label="Próxima fecha"
          />
        </div>
        <div className="new-task-row">
          <button type="button" className="btn-primary" disabled={pending} onClick={save}>
            {pending ? '…' : 'Guardar'}
          </button>
          <button type="button" className="linkbtn" onClick={onDone}>
            Cancelar
          </button>
        </div>
      </div>
    </li>
  );
}
