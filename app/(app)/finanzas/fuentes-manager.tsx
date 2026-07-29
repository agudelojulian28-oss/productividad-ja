'use client';

import { useState, useTransition, type FormEvent } from 'react';
import {
  createIncomeSourceAction,
  archiveIncomeSourceAction,
} from '@/app/actions/finance';
import type { IncomeModel } from '@/core/finance/ports';

type Area = { id: string; name: string };
type Source = { id: string; name: string; areaId: string; model: string };

const MODELS: { value: IncomeModel; label: string }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'producto', label: 'Producto' },
  { value: 'suscripcion', label: 'Suscripción' },
  { value: 'empleo', label: 'Empleo' },
  { value: 'inversion', label: 'Inversión' },
  { value: 'otro', label: 'Otro' },
];

export function FuentesManager({
  areas,
  sources,
  readOnly = false,
}: {
  areas: Area[];
  sources: Source[];
  readOnly?: boolean;
}) {
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '');
  const [model, setModel] = useState<IncomeModel>('servicio');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '—';

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (!areaId) return setError('Elige un área');
    setError(null);
    startTransition(async () => {
      const res = await createIncomeSourceAction({ areaId, name: n, model });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else setName('');
    });
  }

  function onArchive(id: string) {
    startTransition(async () => {
      await archiveIncomeSourceAction(id);
    });
  }

  return (
    <div className="fin-sources">
      {!readOnly && (
        <form onSubmit={onCreate} className="new-task">
          <input
            type="text"
            placeholder="Nueva fuente de ingreso…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            aria-label="Nombre de la fuente"
            autoComplete="off"
          />
          <div className="new-task-row">
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="field"
              aria-label="Área"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as IncomeModel)}
              className="field"
              aria-label="Modelo"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? '…' : 'Crear'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      {sources.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Aún no tienes fuentes de ingreso.
        </p>
      ) : (
        <ul style={{ marginTop: 12 }}>
          {sources.map((s) => (
            <li key={s.id} className="row-card">
              <span className="task-title">{s.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {areaName(s.areaId)} · {s.model}
              </span>
              {!readOnly && (
                <button
                  className="linkbtn task-delete"
                  onClick={() => onArchive(s.id)}
                  disabled={pending}
                  aria-label={`Archivar ${s.name}`}
                >
                  Archivar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
