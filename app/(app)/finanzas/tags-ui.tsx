'use client';

import { useMemo, useState, useTransition } from 'react';
import { createTagAction, updateTagAction, deleteTagAction } from '@/app/actions/finance';

export type TagOption = { id: string; projectId: string; name: string; color: string | null };
type Project = { id: string; title: string };

// Paleta sugerida para etiquetas nuevas.
const PALETTE = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#ef4444'];
const DEFAULT_COLOR = '#f97316';

/** Chips de solo lectura para una lista de ids, resolviendo nombre/color del catálogo. */
export function TagChips({ tagIds, catalog }: { tagIds: string[]; catalog: TagOption[] }) {
  const byId = useMemo(() => new Map(catalog.map((t) => [t.id, t] as const)), [catalog]);
  const tags = tagIds.map((id) => byId.get(id)).filter((t): t is TagOption => Boolean(t));
  if (tags.length === 0) return null;
  return (
    <span className="tag-chips">
      {tags.map((t) => (
        <span key={t.id} className="tag-chip" style={chipStyle(t.color)}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

/** Selector multi (toggle) de etiquetas para un formulario. Las etiquetas son POR
 *  PROYECTO (ADR-029): solo se muestran las del `projectId` dado, y las que se creen
 *  al vuelo quedan en ese proyecto. */
export function TagPicker({
  catalog,
  projectId,
  selected,
  onChange,
}: {
  catalog: TagOption[];
  projectId: string | null | undefined;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sel = new Set(selected);
  const options = catalog.filter((t) => t.projectId === projectId);

  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function create() {
    const name = newName.trim();
    if (!name || !projectId) return;
    startTransition(async () => {
      const r = await createTagAction({ name, color: DEFAULT_COLOR, projectId });
      if (r.ok) {
        catalog.push(r.value); // ayuda en caliente; el padre recarga en su próximo render
        onChange([...selected, r.value.id]);
        setNewName('');
        setCreating(false);
        setError(null);
      } else {
        setError(r.message ?? 'No se pudo');
      }
    });
  }

  if (!projectId) {
    return <p className="muted" style={{ fontSize: 13 }}>Elige un proyecto para ver y crear sus etiquetas.</p>;
  }

  return (
    <div className="tag-picker">
      <div className="tag-picker-list">
        {options.map((t) => {
          const on = sel.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`tag-opt${on ? ' tag-opt-on' : ''}`}
              style={on ? chipStyle(t.color) : undefined}
              aria-pressed={on}
              onClick={() => toggle(t.id)}
            >
              {t.name}
            </button>
          );
        })}
        {!creating && (
          <button type="button" className="tag-opt tag-opt-add" onClick={() => setCreating(true)}>
            + Nueva
          </button>
        )}
      </div>
      {creating && (
        <div className="tag-create">
          <input
            className="field"
            placeholder="Nombre de la etiqueta"
            value={newName}
            maxLength={40}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
          />
          <button type="button" className="btn-primary tag-create-go" disabled={pending} onClick={create}>
            {pending ? '…' : 'Crear'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setCreating(false);
              setNewName('');
              setError(null);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

/** Gestor completo (para el pop-up): crear bajo un proyecto, renombrar, recolorear y
 *  borrar. La lista se agrupa por proyecto. */
export function TagManager({ catalog, projects }: { catalog: TagOption[]; projects: Project[] }) {
  const [tags, setTags] = useState<TagOption[]>(catalog);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function create() {
    const n = name.trim();
    if (!n || !projectId) return;
    startTransition(async () => {
      const r = await createTagAction({ name: n, color, projectId });
      if (r.ok) {
        setTags((prev) => [...prev, r.value]);
        setName('');
        setError(null);
      } else setError(r.message ?? 'No se pudo');
    });
  }

  function rename(id: string, newName: string) {
    const n = newName.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await updateTagAction({ id, name: n });
      if (r.ok) setTags((prev) => prev.map((t) => (t.id === id ? r.value : t)));
      else setError(r.message ?? 'No se pudo');
    });
  }

  function recolor(id: string, newColor: string) {
    startTransition(async () => {
      const r = await updateTagAction({ id, color: newColor });
      if (r.ok) setTags((prev) => prev.map((t) => (t.id === id ? r.value : t)));
    });
  }

  function remove(id: string, tName: string) {
    if (!confirm(`¿Borrar la etiqueta "${tName}"? Se quitará de todos sus movimientos.`)) return;
    startTransition(async () => {
      const r = await deleteTagAction(id);
      if (r.ok) setTags((prev) => prev.filter((t) => t.id !== id));
      else setError(r.message ?? 'No se pudo');
    });
  }

  return (
    <div className="tag-manager">
      <div className="tag-manager-new">
        <select
          className="field"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Proyecto de la etiqueta"
        >
          {projects.length === 0 && <option value="">Crea un proyecto primero</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <input
          className="field"
          placeholder="Nueva etiqueta"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
        />
        <div className="tag-swatches" role="group" aria-label="Color">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`tag-swatch${color === c ? ' tag-swatch-on' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button type="button" className="btn-primary" disabled={pending || !projectId} onClick={create}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {tags.length === 0 ? (
        <p className="muted">Aún no tienes etiquetas. Crea la primera arriba, dentro de un proyecto.</p>
      ) : (
        <div className="tag-manager-groups">
          {grouped.map(([pid, list]) => (
            <div key={pid} className="tag-manager-group">
              <h4 className="tag-group-title">{projName.get(pid) ?? 'Proyecto'}</h4>
              <ul className="tag-manager-list">
                {list.map((t) => (
                  <li key={t.id} className="tag-manager-row">
                    <span className="tag-chip" style={chipStyle(t.color)}>
                      {t.name}
                    </span>
                    <input
                      className="field tag-manager-name"
                      defaultValue={t.name}
                      maxLength={40}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== t.name) rename(t.id, e.target.value);
                      }}
                    />
                    <div className="tag-swatches">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`tag-swatch${(t.color ?? DEFAULT_COLOR) === c ? ' tag-swatch-on' : ''}`}
                          style={{ background: c }}
                          aria-label={`Color ${c}`}
                          onClick={() => recolor(t.id, c)}
                        />
                      ))}
                    </div>
                    <button type="button" className="btn-ghost tag-del" onClick={() => remove(t.id, t.name)}>
                      Borrar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function chipStyle(color: string | null): React.CSSProperties {
  const c = color ?? DEFAULT_COLOR;
  return {
    background: `color-mix(in srgb, ${c} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
    color: `color-mix(in srgb, ${c} 75%, white)`,
  };
}
