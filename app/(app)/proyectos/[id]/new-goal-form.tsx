'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createGoalAction } from '@/app/actions/goals';

export function NewGoalForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const res = await createGoalAction({
        projectId,
        title: t,
        targetValue: cantidad ? Number(cantidad) : undefined,
        deadline: fecha || undefined,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        setCantidad('');
        setFecha('');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-task">
      <input
        type="text"
        placeholder="Nueva meta…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field"
        aria-label="Título de la meta"
      />
      <div className="new-task-row">
        <input
          type="number"
          min="1"
          inputMode="numeric"
          placeholder="Cantidad objetivo"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="field"
          aria-label="Cantidad objetivo"
        />
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="field"
          aria-label="Fecha límite"
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
