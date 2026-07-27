'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createGoalAction } from '@/app/actions/goals';

export function NewGoalForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const res = await createGoalAction({ projectId, title: t });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else setTitle('');
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-task">
      <div className="new-task-row">
        <input
          type="text"
          placeholder="Nueva meta…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field"
          aria-label="Título de la meta"
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
