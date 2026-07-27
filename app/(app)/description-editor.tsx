'use client';

import { useState, useTransition } from 'react';
import type { Result } from '@/core/types';

/** Editor de descripción reutilizable. Recibe la acción de guardado ya ligada al id
 *  de la entidad (con `.bind(null, id)`), así sirve para área/proyecto/meta/tarea. */
export function DescriptionEditor({
  initial,
  action,
}: {
  initial: string;
  action: (description: string) => Promise<Result<unknown>>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await action(value);
      if (!res.ok) setError(res.message ?? 'No se pudo guardar');
      else setSaved(true);
    });
  }

  return (
    <div className="desc-editor">
      <textarea
        className="field"
        rows={5}
        placeholder="Añade una descripción…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        aria-label="Descripción"
      />
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
