'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createTaskAction } from '@/app/actions/tasks';

export function NewTaskForm() {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    // datetime-local → instante ISO (con offset Z). El navegador lo interpreta
    // en la hora local del usuario, que es lo correcto.
    const dueAt = due ? new Date(due).toISOString() : undefined;
    startTransition(async () => {
      const res = await createTaskAction({ title: t, dueAt });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        setDue('');
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
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="field"
          aria-label="Fecha y hora"
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Agregar'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
