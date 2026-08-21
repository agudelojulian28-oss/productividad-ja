'use client';

import { useMemo, useState } from 'react';
import { TaskItem } from './task-item';
import type { TaskRow } from '@/core/work/ports';

type Section = { label: string; tone?: 'danger'; items: TaskRow[] };

/** Lista de tareas con filtro por proyecto (chips). Las secciones (Vencidas/Hoy/…)
 *  llegan resueltas del servidor; aquí solo se filtran y pintan. */
export function TareasList({
  sections,
  projects,
  tz,
}: {
  sections: Section[];
  projects: { id: string; title: string }[];
  tz: string;
}) {
  const [filter, setFilter] = useState<string | null>(null); // projectId · 'none' · null (todos)
  const projName = useMemo(() => new Map(projects.map((p) => [p.id, p.title] as const)), [projects]);

  const present = useMemo(() => {
    const ids = new Set<string>();
    let hasNone = false;
    for (const s of sections) {
      for (const t of s.items) {
        if (t.projectId) ids.add(t.projectId);
        else hasNone = true;
      }
    }
    // Ordena los proyectos presentes por nombre.
    const ordered = [...ids].sort((a, b) => (projName.get(a) ?? '').localeCompare(projName.get(b) ?? ''));
    return { ids: ordered, hasNone };
  }, [sections, projName]);

  const match = (t: TaskRow) =>
    filter === null ? true : filter === 'none' ? !t.projectId : t.projectId === filter;
  const filtered = sections
    .map((s) => ({ ...s, items: s.items.filter(match) }))
    .filter((s) => s.items.length > 0);

  const hayFiltro = present.ids.length > 0 || present.hasNone;

  return (
    <>
      {hayFiltro && (
        <div className="tareas-filter" role="group" aria-label="Filtrar tareas por proyecto">
          <button
            type="button"
            className={`tag-opt${filter === null ? ' tag-opt-on' : ''}`}
            aria-pressed={filter === null}
            onClick={() => setFilter(null)}
          >
            Todos
          </button>
          {present.ids.map((id) => (
            <button
              key={id}
              type="button"
              className={`tag-opt${filter === id ? ' tag-opt-on' : ''}`}
              aria-pressed={filter === id}
              onClick={() => setFilter(filter === id ? null : id)}
            >
              {projName.get(id) ?? '—'}
            </button>
          ))}
          {present.hasNone && (
            <button
              type="button"
              className={`tag-opt${filter === 'none' ? ' tag-opt-on' : ''}`}
              aria-pressed={filter === 'none'}
              onClick={() => setFilter(filter === 'none' ? null : 'none')}
            >
              Sin proyecto
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted" style={{ padding: '8px 2px' }}>
          Sin tareas para ese filtro.
        </p>
      ) : (
        filtered.map((s) => (
          <section key={s.label} className="task-section">
            <h2 className={`section-title${s.tone === 'danger' ? ' section-danger' : ''}`}>
              <span>{s.label}</span>
              <span className="section-count">{s.items.length}</span>
            </h2>
            <ul>
              {s.items.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  tz={tz}
                  projectName={t.projectId ? projName.get(t.projectId) : undefined}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
