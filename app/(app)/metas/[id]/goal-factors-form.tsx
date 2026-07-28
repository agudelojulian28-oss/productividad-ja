'use client';

import { useState, useTransition } from 'react';
import { updateGoalAction } from '@/app/actions/goals';

export function GoalFactorsForm({
  goalId,
  targetValue,
  deadline,
}: {
  goalId: string;
  targetValue: number;
  deadline: string;
}) {
  const [cantidad, setCantidad] = useState(String(targetValue));
  const [fecha, setFecha] = useState(deadline);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateGoalAction(goalId, {
        targetValue: cantidad ? Number(cantidad) : undefined,
        deadline: fecha || undefined,
      });
      if (!res.ok) setError(res.message ?? 'No se pudo guardar');
      else setSaved(true);
    });
  }

  return (
    <div className="goal-factors">
      <label className="cal-field-label">
        Cantidad objetivo
        <input
          type="number"
          min="1"
          inputMode="numeric"
          className="field"
          value={cantidad}
          onChange={(e) => {
            setCantidad(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label className="cal-field-label">
        Fecha límite
        <input
          type="date"
          className="field"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <div className="desc-editor-actions">
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        {saved && <span className="muted">Guardado ✓</span>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
