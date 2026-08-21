'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createRecurringTaskAction,
  updateRecurringTaskAction,
  deleteRecurringTaskAction,
} from '@/app/actions/tasks';
import { DateField, TimeField } from '../../date-picker';

export type RecurRow = {
  id: string;
  title: string;
  notes: string | null;
  projectId: string | null;
  goalId: string | null;
  frequency: string;
  dueTime: string | null;
  nextDueOn: string;
};
type Project = { id: string; title: string };
type Goal = { id: string; title: string; projectId: string | null };

const FREQS: { v: string; label: string }[] = [
  { v: 'semanal', label: 'Semanal' },
  { v: 'quincenal', label: 'Quincenal' },
  { v: 'mensual', label: 'Mensual' },
  { v: 'bimestral', label: 'Bimestral' },
  { v: 'trimestral', label: 'Trimestral' },
  { v: 'anual', label: 'Anual' },
];
const freqLabel = (v: string) => FREQS.find((f) => f.v === v)?.label ?? v;

function dLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date((y ?? 1970), (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** Campos compartidos por crear y editar. */
function Form({
  init,
  projects,
  goals,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  init: Partial<RecurRow>;
  projects: Project[];
  goals: Goal[];
  pending: boolean;
  onSubmit: (v: Omit<RecurRow, 'id'>) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(init.title ?? '');
  const [frequency, setFrequency] = useState(init.frequency ?? 'semanal');
  const [nextDueOn, setNextDueOn] = useState(init.nextDueOn ?? '');
  const [dueTime, setDueTime] = useState(init.dueTime ?? '');
  const [projectId, setProjectId] = useState(init.projectId ?? '');
  const [goalId, setGoalId] = useState(init.goalId ?? '');
  const [notes, setNotes] = useState(init.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const projectGoals = goals.filter((g) => g.projectId === projectId);

  function submit() {
    if (!title.trim()) return setError('El título es obligatorio');
    if (!nextDueOn) return setError('Elige la próxima fecha');
    setError(null);
    onSubmit({
      title: title.trim(),
      notes: notes.trim() || null,
      projectId: projectId || null,
      goalId: goalId || null,
      frequency,
      dueTime: dueTime || null,
      nextDueOn,
    });
  }

  return (
    <div className="rt-form">
      <label className="cal-field-label">
        Título
        <input className="field" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="rt-form-row">
        <label className="cal-field-label" style={{ flex: 1 }}>
          Frecuencia
          <select className="field" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="cal-field-label" style={{ flex: 1 }}>
          Próxima fecha
          <DateField value={nextDueOn} onChange={setNextDueOn} ariaLabel="Próxima fecha" />
        </div>
      </div>
      <div className="rt-form-row">
        <div className="cal-field-label" style={{ flex: 1 }}>
          Hora (opcional)
          <TimeField value={dueTime} onChange={setDueTime} ariaLabel="Hora" />
        </div>
        <label className="cal-field-label" style={{ flex: 1 }}>
          Proyecto
          <select
            className="field"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (goalId && !goals.some((g) => g.id === goalId && g.projectId === e.target.value)) setGoalId('');
            }}
          >
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {projectId && projectGoals.length > 0 && (
        <label className="cal-field-label">
          Meta
          <select className="field" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Sin meta</option>
            {projectGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="cal-field-label">
        Notas (opcional)
        <textarea className="field" rows={2} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="rt-form-actions">
        <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
          {pending ? '…' : submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function RecurringTasksManager({
  recurrentes,
  projects,
  goals,
}: {
  recurrentes: RecurRow[];
  projects: Project[];
  goals: Goal[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const projName = useMemo(() => new Map(projects.map((p) => [p.id, p.title] as const)), [projects]);

  function create(v: Omit<RecurRow, 'id'>) {
    start(async () => {
      const r = await createRecurringTaskAction(v);
      if (r.ok) {
        setCreating(false);
        router.refresh();
      }
    });
  }
  function update(id: string, v: Omit<RecurRow, 'id'>) {
    start(async () => {
      const r = await updateRecurringTaskAction({ id, ...v });
      if (r.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }
  function remove(id: string, title: string) {
    if (!confirm(`¿Borrar la tarea recurrente "${title}"?`)) return;
    start(async () => {
      const r = await deleteRecurringTaskAction(id);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="rt-wrap">
      {creating ? (
        <div className="rt-card">
          <Form
            init={{}}
            projects={projects}
            goals={goals}
            pending={pending}
            submitLabel="Crear"
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button type="button" className="btn-primary rt-new" onClick={() => setCreating(true)}>
          + Nueva tarea recurrente
        </button>
      )}

      {recurrentes.length === 0 && !creating ? (
        <p className="muted" style={{ marginTop: 14 }}>
          Aún no tienes tareas recurrentes. Crea una y aparecerá sola cuando llegue su fecha.
        </p>
      ) : (
        <ul className="rt-list">
          {recurrentes.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="rt-card">
                <Form
                  init={r}
                  projects={projects}
                  goals={goals}
                  pending={pending}
                  submitLabel="Guardar"
                  onSubmit={(v) => update(r.id, v)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="rt-row">
                <div className="rt-row-body">
                  <span className="rt-row-title">{r.title}</span>
                  <span className="rt-row-meta">
                    {freqLabel(r.frequency)} · próxima {dLabel(r.nextDueOn)}
                    {r.dueTime ? ` · ${r.dueTime}` : ''}
                    {r.projectId ? ` · ${projName.get(r.projectId) ?? ''}` : ''}
                  </span>
                </div>
                <div className="rt-row-actions">
                  <button type="button" className="btn-ghost" onClick={() => setEditing(r.id)}>
                    Editar
                  </button>
                  <button type="button" className="btn-ghost rt-del" onClick={() => remove(r.id, r.title)}>
                    Borrar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
