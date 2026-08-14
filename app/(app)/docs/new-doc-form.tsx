'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { createDocumentAction } from '@/app/actions/documents';
import type { DocumentKind } from '@/core/structure/ports';
import { SegSelect } from '../seg-select';

type Area = { id: string; name: string };
type Project = { id: string; title: string };

const KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'proceso', label: 'Proceso' },
  { value: 'preferencia', label: 'Preferencia' },
  { value: 'nota', label: 'Nota' },
];

export function NewDocForm({
  areas = [],
  projects = [],
  fixedProjectId,
  onDone,
}: {
  areas?: Area[];
  projects?: Project[];
  fixedProjectId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocumentKind>('proceso');
  const [scope, setScope] = useState(''); // '' = global
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    let areaId: string | undefined;
    let projectId: string | undefined;
    if (fixedProjectId) projectId = fixedProjectId;
    else if (scope.startsWith('area:')) areaId = scope.slice(5);
    else if (scope.startsWith('proj:')) projectId = scope.slice(5);

    startTransition(async () => {
      const res = await createDocumentAction({ title: t, kind, areaId, projectId });
      if (!res.ok) setError(res.message ?? 'No se pudo crear');
      else {
        setTitle('');
        onDone?.();
        router.push(`/docs/${res.value.id}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-task">
      <input
        type="text"
        placeholder="Título del documento (ej. Cómo cotizo un proyecto)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field"
        aria-label="Título del documento"
        autoComplete="off"
      />
      <SegSelect
        ariaLabel="Tipo de documento"
        value={kind}
        onChange={setKind}
        options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />
      <div className="new-task-row">
        {!fixedProjectId && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="field"
            aria-label="Alcance"
          >
            <option value="">Método global</option>
            {areas.length > 0 && (
              <optgroup label="Área">
                {areas.map((a) => (
                  <option key={a.id} value={`area:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
            {projects.length > 0 && (
              <optgroup label="Proyecto">
                {projects.map((p) => (
                  <option key={p.id} value={`proj:${p.id}`}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? '…' : 'Crear'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
