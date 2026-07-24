'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createAreaAction } from '@/app/actions/areas';

export function NewAreaForm() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'negocio' | 'personal'>('negocio');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setError(null);
    startTransition(async () => {
      const res = await createAreaAction({ name: n, kind });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else setName('');
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-task">
      <input
        type="text"
        placeholder="Nueva área…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field"
        aria-label="Nombre del área"
      />
      <div className="new-task-row">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'negocio' | 'personal')}
          className="field"
          aria-label="Tipo de área"
        >
          <option value="negocio">Negocio</option>
          <option value="personal">Personal</option>
        </select>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
