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
import { Modal } from '../modal';
import { DateField } from '../date-picker';
import { TagChips, TagPicker, type TagOption } from './tags-ui';

type Project = { id: string; title: string; areaId: string };
export type RecurRow = {
  id: string;
  direction: 'in' | 'out';
  projectId: string;
  amountMinor: number;
  category: string | null;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueOn: string;
  tagIds: string[];
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

// Un solo componente sirve para gastos (out) e ingresos (in) recurrentes: cambian
// las etiquetas de texto y el signo/color del monto, no la máquina.
const COPY = {
  out: { singular: 'gasto recurrente', nuevo: 'Nuevo gasto recurrente', vacio: 'Sin gastos recurrentes todavía.', sign: '−', cls: 'fin-neg' },
  in: { singular: 'ingreso recurrente', nuevo: 'Nuevo ingreso recurrente', vacio: 'Sin ingresos recurrentes todavía.', sign: '+', cls: 'fin-pos' },
} as const;

export function Recurrentes({
  direction,
  projects,
  recurrentes,
  today,
  tags = [],
}: {
  direction: 'in' | 'out';
  projects: Project[];
  recurrentes: RecurRow[];
  today: string;
  tags?: TagOption[];
}) {
  const copy = COPY[direction];
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {recurrentes.length > 0 ? (
        <ul className="fin-list" style={{ marginBottom: 14 }}>
          {recurrentes.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} row={r} tags={tags} onDone={() => setEditing(null)} />
            ) : (
              <li key={r.id} className="recur-row">
                <div className="recur-body">
                  <span className="recur-title">
                    {r.description || r.category || copy.singular}
                  </span>
                  <span className="recur-meta">
                    {freqLabel(r.frequency)} · próximo {r.nextDueOn}
                    {projects.find((p) => p.id === r.projectId)
                      ? ` · ${projects.find((p) => p.id === r.projectId)!.title}`
                      : ''}
                  </span>
                  {r.tagIds.length > 0 && <TagChips tagIds={r.tagIds} catalog={tags} />}
                </div>
                <span className={`recur-amt ${copy.cls}`}>
                  {copy.sign}
                  {money(r.amountMinor, { compact: true })}
                </span>
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
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>
          {copy.vacio}
        </p>
      )}

      <button type="button" className="btn-ghost meta-add" onClick={() => setOpen(true)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {copy.nuevo}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Finanzas" title={copy.nuevo}>
        <RecurForm
          direction={direction}
          projects={projects}
          today={today}
          tags={tags}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}

function RecurForm({
  direction,
  projects,
  today,
  tags,
  onDone,
}: {
  direction: 'in' | 'out';
  projects: Project[];
  today: string;
  tags: TagOption[];
  onDone: () => void;
}) {
  const copy = COPY[direction];
  const [monto, setMonto] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [category, setCategory] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('mensual');
  const [nextDueOn, setNextDueOn] = useState(today);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
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
        direction,
        projectId: project.id,
        areaId: project.areaId,
        amountMinor: minor,
        category: category.trim() || undefined,
        description: descripcion.trim() || undefined,
        frequency,
        nextDueOn,
        tagIds,
      });
      if (!r.ok) setError(r.message ?? 'No se pudo crear');
      else onDone();
    });
  }

  return (
    <form onSubmit={onCreate} className="fin-form">
      <select
        value={projectId}
        onChange={(e) => {
          setProjectId(e.target.value);
          setTagIds([]); // etiquetas por proyecto
        }}
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
        placeholder={direction === 'in' ? 'Concepto (ej. sueldo, arriendo cobrado)' : 'Concepto (ej. arriendo, Netflix)'}
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
      <div className="cal-field-label">
        Próxima fecha
        <DateField value={nextDueOn} onChange={setNextDueOn} ariaLabel="Próxima fecha" />
      </div>
      <div className="cal-field-label">
        Etiquetas
        <TagPicker catalog={tags} projectId={projectId} selected={tagIds} onChange={setTagIds} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? '…' : `Agregar ${copy.singular}`}
      </button>
    </form>
  );
}

function EditRow({ row, tags, onDone }: { row: RecurRow; tags: TagOption[]; onDone: () => void }) {
  const [monto, setMonto] = useState(String(row.amountMinor / 100));
  const [descripcion, setDescripcion] = useState(row.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(row.frequency);
  const [nextDueOn, setNextDueOn] = useState(row.nextDueOn);
  const [tagIds, setTagIds] = useState<string[]>(row.tagIds);
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
        tagIds,
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
          <DateField value={nextDueOn} onChange={setNextDueOn} ariaLabel="Próxima fecha" />
        </div>
        <div className="cal-field-label">
          Etiquetas
          <TagPicker catalog={tags} projectId={row.projectId} selected={tagIds} onChange={setTagIds} />
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
