'use client';

import { useState, useTransition } from 'react';
import { updateGoalAction } from '@/app/actions/goals';
import { DateField } from '../../date-picker';

export function GoalFactorsForm({
  goalId,
  targetValue,
  startDate,
  deadline,
}: {
  goalId: string;
  targetValue: number;
  startDate: string;
  deadline: string;
}) {
  const [cantidad, setCantidad] = useState(String(targetValue));
  const [inicio, setInicio] = useState(startDate);
  const [fin, setFin] = useState(deadline);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function touched() {
    setSaved(false);
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateGoalAction(goalId, {
        targetValue: cantidad ? Number(cantidad) : undefined,
        startDate: inicio || undefined,
        deadline: fin || undefined,
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
            touched();
          }}
        />
      </label>
      <div className="new-task-row">
        <div className="cal-field-label" style={{ flex: 1 }}>
          Fecha de inicio
          <DateField
            value={inicio}
            onChange={(v) => {
              setInicio(v);
              touched();
            }}
            ariaLabel="Fecha de inicio"
          />
        </div>
        <div className="cal-field-label" style={{ flex: 1 }}>
          Cumplimiento esperado
          <DateField
            value={fin}
            min={inicio}
            onChange={(v) => {
              setFin(v);
              touched();
            }}
            ariaLabel="Cumplimiento esperado"
          />
        </div>
      </div>
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
