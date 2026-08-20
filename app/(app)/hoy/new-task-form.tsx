'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createTaskAction } from '@/app/actions/tasks';
import { DateTimeField } from '../date-picker';

export function NewTaskForm({
  projects,
  goalsByProject = {},
  onDone,
}: {
  projects: { id: string; title: string }[];
  goalsByProject?: Record<string, { id: string; title: string }[]>;
  onDone?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [projectId, setProjectId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const goals = projectId ? (goalsByProject[projectId] ?? []) : [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    // datetime-local → instante ISO (con offset Z). El navegador lo interpreta
    // en la hora local del usuario, que es lo correcto.
    const dueAt = due ? new Date(due).toISOString() : undefined;
    startTransition(async () => {
      const res = await createTaskAction({
        title: t,
        dueAt,
        projectId: projectId || undefined,
        goalId: goalId || undefined,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        setDue('');
        setProjectId('');
        setGoalId('');
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-task">
      <input
        type="text"
        placeholder="Nueva tarea…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field"
        aria-label="Título de la tarea"
      />
      <div className="new-task-row">
        <DateTimeField value={due} onChange={setDue} ariaLabel="Fecha y hora" />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Agregar'}
        </button>
      </div>
      {projects.length > 0 && (
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setGoalId('');
          }}
          className="field"
          aria-label="Proyecto"
        >
          <option value="">Sin proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}
      {goals.length > 0 && (
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="field"
          aria-label="Meta"
        >
          <option value="">Sin meta</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      )}
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
