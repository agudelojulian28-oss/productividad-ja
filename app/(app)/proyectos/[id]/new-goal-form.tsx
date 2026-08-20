'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createGoalAction } from '@/app/actions/goals';
import { DateField } from '../../date-picker';

export function NewGoalForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
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
        startDate: inicio || undefined,
        deadline: fin || undefined,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        setCantidad('');
        setInicio('');
        setFin('');
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
      <div className="new-task-row">
        <div className="cal-field-label" style={{ flex: 1 }}>
          Inicio
          <DateField value={inicio} onChange={setInicio} ariaLabel="Fecha de inicio" />
        </div>
        <div className="cal-field-label" style={{ flex: 1 }}>
          Cumplimiento
          <DateField value={fin} min={inicio} onChange={setFin} ariaLabel="Fecha de cumplimiento esperado" />
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? '…' : 'Crear meta'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
