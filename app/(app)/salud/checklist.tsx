'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCheckinAction } from '@/app/actions/health';
import type { HealthItemRow, HealthSection } from '@/core/health/ports';
import { sectionIcon } from './icons';

const SECTION_LABEL: Record<HealthSection, string> = {
  espiritual: 'Espiritual',
  cuerpo: 'Cuerpo',
  entrenamiento: 'Entreno',
  dieta: 'Dieta',
};

/** Checklist del día: casillas nativas con etiqueta (toda la fila es tocable, ≥48px).
 *  Marca de forma optimista y anuncia el progreso a lectores de pantalla. */
export function HealthChecklist({
  items,
  doneIds,
  day,
  compact = false,
}: {
  items: HealthItemRow[];
  doneIds: string[];
  day: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(() => new Set(doneIds));
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = items.length;
  const count = items.filter((i) => done.has(i.id)).length;
  const pct = total ? Math.round((count / total) * 100) : 0;

  function toggle(id: string, next: boolean) {
    setError(null);
    setDone((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    start(async () => {
      const r = await setCheckinAction({ itemId: id, day, done: next });
      if (!r.ok) {
        // Revierte si falló.
        setDone((prev) => {
          const s = new Set(prev);
          if (next) s.delete(id);
          else s.add(id);
          return s;
        });
        setError('No se pudo guardar. Intenta de nuevo.');
      } else {
        router.refresh();
      }
    });
  }

  if (total === 0) {
    return <p className="muted">Hoy no tienes nada con seguimiento. Actívalo en cualquier elemento del plan.</p>;
  }

  return (
    <div className={`sl-check${compact ? ' compact' : ''}`}>
      <div className="sl-check-head">
        <div className="sl-progress" aria-hidden="true">
          <div className={`sl-progress-fill${pct === 100 ? ' full' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="sl-check-count" aria-live="polite">
          {count} de {total}
          {pct === 100 ? ' · ¡día completo!' : ''}
        </span>
      </div>
      <ul className="sl-check-list">
        {items.map((it) => {
          const on = done.has(it.id);
          const id = `chk-${it.id}`;
          return (
            <li key={it.id}>
              <label htmlFor={id} className={`sl-check-row${on ? ' on' : ''}`}>
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(it.id, e.target.checked)}
                  className="sl-check-input"
                />
                <span className="sl-check-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                <span className="sl-check-ico" aria-hidden="true">
                  {sectionIcon(it.section)}
                </span>
                <span className="sl-check-text">
                  <span className="sl-check-title">{it.title}</span>
                  {!compact && (
                    <span className="sl-check-meta">
                      {SECTION_LABEL[it.section]}
                      {it.timeOfDay ? ` · ${it.timeOfDay}` : ''}
                      {it.durationMin ? ` · ${it.durationMin} min` : ''}
                    </span>
                  )}
                </span>
                {compact && it.timeOfDay && <span className="sl-chip">{it.timeOfDay}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
