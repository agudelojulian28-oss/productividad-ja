'use client';

import { useMemo, useState } from 'react';
import { Modal } from '../modal';
import { TagChips, TagManager, type TagOption } from './tags-ui';

type Project = { id: string; title: string };

/** Sección "Etiquetas" del panel: muestra la lista de creadas (agrupada por proyecto)
 *  y un botón que abre el gestor completo en un pop-up. */
export function TagsSection({ tags, projects }: { tags: TagOption[]; projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const projName = useMemo(() => new Map(projects.map((p) => [p.id, p.title] as const)), [projects]);

  const grouped = useMemo(() => {
    const m = new Map<string, TagOption[]>();
    for (const t of [...tags].sort((a, b) => a.name.localeCompare(b.name))) {
      const arr = m.get(t.projectId) ?? [];
      arr.push(t);
      m.set(t.projectId, arr);
    }
    return [...m.entries()];
  }, [tags]);

  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Etiquetas por proyecto para clasificar sus ingresos y gastos.
      </p>

      {grouped.length === 0 ? (
        <p className="muted" style={{ marginBottom: 12 }}>Aún no tienes etiquetas.</p>
      ) : (
        <div className="tag-list-view">
          {grouped.map(([pid, list]) => (
            <div key={pid} className="tag-list-group">
              <span className="tag-list-proj">{projName.get(pid) ?? 'Proyecto'}</span>
              <TagChips tagIds={list.map((t) => t.id)} catalog={list} />
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn-ghost meta-add" onClick={() => setOpen(true)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Gestionar etiquetas
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Finanzas" title="Etiquetas">
        <TagManager catalog={tags} projects={projects} />
      </Modal>
    </div>
  );
}
