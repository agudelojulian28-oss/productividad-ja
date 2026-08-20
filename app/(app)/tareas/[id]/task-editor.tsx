'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateTaskAction,
  completeTaskAction,
  reopenTaskAction,
  deleteTaskAction,
} from '@/app/actions/tasks';
import { DateTimeField } from '../../date-picker';

type Project = { id: string; title: string };
type Goal = { id: string; title: string; projectId: string | null };
type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  projectId: string | null;
  goalId: string | null;
  status: 'pending' | 'done' | 'cancelled';
};

const p2 = (n: number) => String(n).padStart(2, '0');
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function TaskEditor({
  task,
  projects,
  goals,
}: {
  task: Task;
  projects: Project[];
  goals: Goal[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [due, setDue] = useState(isoToLocal(task.dueAt));
  const [projectId, setProjectId] = useState(task.projectId ?? '');
  const [goalId, setGoalId] = useState(task.goalId ?? '');
  const [status, setStatus] = useState(task.status);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const projectGoals = goals.filter((g) => g.projectId === projectId);

  function save() {
    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    start(async () => {
      const r = await updateTaskAction({
        id: task.id,
        title: title.trim(),
        notes: notes.trim() || null,
        dueAt: localToIso(due),
        projectId: projectId || null,
        goalId: goalId || null,
      });
      if (r.ok) {
        setError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        router.refresh();
      } else {
        setError(r.message ?? 'No se pudo guardar');
      }
    });
  }

  function toggleDone() {
    start(async () => {
      const r = status === 'done' ? await reopenTaskAction(task.id) : await completeTaskAction(task.id);
      if (r.ok) {
        setStatus(r.value.status);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm('¿Borrar esta tarea? No se puede deshacer.')) return;
    start(async () => {
      const r = await deleteTaskAction(task.id);
      if (r.ok) router.push('/hoy');
      else setError(r.message ?? 'No se pudo borrar');
    });
  }

  return (
    <div className="task-editor">
      <label className="cal-field-label">
        Título
        <input
          className="field"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Título de la tarea"
        />
      </label>

      <div className="cal-field-label">
        Fecha y hora
        <DateTimeField value={due} onChange={setDue} ariaLabel="Fecha y hora de la tarea" />
        {due && (
          <button type="button" className="btn-ghost task-clear-date" onClick={() => setDue('')}>
            Quitar fecha
          </button>
        )}
      </div>

      <label className="cal-field-label">
        Proyecto
        <select
          className="field"
          value={projectId}
          onChange={(e) => {
            const next = e.target.value;
            setProjectId(next);
            // Si la meta actual no es de ese proyecto, límpiala.
            if (goalId && !goals.some((g) => g.id === goalId && g.projectId === next)) setGoalId('');
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
        Notas
        <textarea
          className="field task-notes"
          value={notes}
          maxLength={5000}
          rows={4}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalles, enlaces, subtareas…"
        />
      </label>

      {error && <p className="error-text">{error}</p>}

      <div className="task-editor-actions">
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn-ghost" onClick={toggleDone} disabled={pending}>
          {status === 'done' ? 'Reabrir' : 'Marcar como hecha'}
        </button>
        <button type="button" className="btn-ghost task-del" onClick={remove} disabled={pending}>
          Borrar
        </button>
      </div>
    </div>
  );
}
