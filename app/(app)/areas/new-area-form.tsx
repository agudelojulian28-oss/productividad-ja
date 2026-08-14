'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createAreaAction } from '@/app/actions/areas';
import { SegSelect } from '../seg-select';

export function NewAreaForm({ onDone }: { onDone?: () => void }) {
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
      else {
        setName('');
        onDone?.();
      }
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
      <SegSelect
        ariaLabel="Tipo de área"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'negocio', label: 'Negocio' },
          { value: 'personal', label: 'Personal' },
        ]}
      />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? '…' : 'Crear'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
