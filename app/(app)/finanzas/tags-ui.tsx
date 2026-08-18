'use client';

import { useMemo, useState, useTransition } from 'react';
import { createTagAction, updateTagAction, deleteTagAction } from '@/app/actions/finance';

export type TagOption = { id: string; name: string; color: string | null };

// Paleta sugerida para etiquetas nuevas (el usuario también puede escribir su hex).
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

/** Selector multi (toggle) de etiquetas para un formulario. Controlado por `selected`. */
export function TagPicker({
  catalog,
  selected,
  onChange,
}: {
  catalog: TagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sel = new Set(selected);

  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function create() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const r = await createTagAction({ name, color: DEFAULT_COLOR });
      if (r.ok) {
        catalog.push(r.value); // el padre recarga en su próximo render; esto ayuda en caliente
        onChange([...selected, r.value.id]);
        setNewName('');
        setCreating(false);
        setError(null);
      } else {
        setError(r.message ?? "No se pudo");
      }
    });
  }

  return (
    <div className="tag-picker">
      <div className="tag-picker-list">
        {catalog.map((t) => {
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

/** Gestor completo: crear, renombrar, recolorear y borrar etiquetas. */
export function TagManager({ catalog }: { catalog: TagOption[] }) {
  const [tags, setTags] = useState<TagOption[]>(catalog);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await createTagAction({ name: n, color });
      if (r.ok) {
        setTags((prev) => [...prev, r.value].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
        setError(null);
      } else setError(r.message ?? "No se pudo");
    });
  }

  function rename(id: string, newName: string) {
    const n = newName.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await updateTagAction({ id, name: n });
      if (r.ok) setTags((prev) => prev.map((t) => (t.id === id ? r.value : t)));
      else setError(r.message ?? "No se pudo");
    });
  }

  function recolor(id: string, newColor: string) {
    startTransition(async () => {
      const r = await updateTagAction({ id, color: newColor });
      if (r.ok) setTags((prev) => prev.map((t) => (t.id === id ? r.value : t)));
    });
  }

  function remove(id: string, tName: string) {
    if (!confirm(`¿Borrar la etiqueta "${tName}"? Se quitará de todos los movimientos.`)) return;
    startTransition(async () => {
      const r = await deleteTagAction(id);
      if (r.ok) setTags((prev) => prev.filter((t) => t.id !== id));
      else setError(r.message ?? "No se pudo");
    });
  }

  return (
    <div className="tag-manager">
      <div className="tag-manager-new">
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
        <button type="button" className="btn-primary" disabled={pending} onClick={create}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {tags.length === 0 ? (
        <p className="muted">Aún no tienes etiquetas. Crea la primera arriba.</p>
      ) : (
        <ul className="tag-manager-list">
          {tags.map((t) => (
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
      )}
    </div>
  );
}

function chipStyle(color: string | null): React.CSSProperties {
  const c = color ?? DEFAULT_COLOR;
  return {
    // Fondo tenue del color + texto/borde del color pleno (funciona en tema oscuro).
    background: `color-mix(in srgb, ${c} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
    color: `color-mix(in srgb, ${c} 75%, white)`,
  };
}
