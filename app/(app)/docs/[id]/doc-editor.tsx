'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { updateDocumentAction, deleteDocumentAction } from '@/app/actions/documents';

export function DocEditor({
  id,
  initialTitle,
  initialContent,
  initialPinned,
}: {
  id: string;
  initialTitle: string;
  initialContent: string;
  initialPinned: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [pinned, setPinned] = useState(initialPinned);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateDocumentAction(id, { title: title.trim(), content, pinned });
      if (!res.ok) setError(res.message ?? 'No se pudo guardar');
      else setSaved(true);
    });
  }

  function remove() {
    if (!confirm('¿Borrar este documento? No se puede deshacer.')) return;
    startTransition(async () => {
      const res = await deleteDocumentAction(id);
      if (!res.ok) setError(res.message ?? 'No se pudo borrar');
      else router.push('/docs');
    });
  }

  return (
    <div className="doc-editor">
      <input
        type="text"
        className="field doc-title-input"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setSaved(false);
        }}
        aria-label="Título"
      />
      <textarea
        className="field doc-content"
        rows={16}
        placeholder="Escribe aquí el proceso, la preferencia o la nota. Markdown simple."
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        aria-label="Contenido"
        style={{ resize: 'vertical', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
      />
      <label className="doc-pin">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => {
            setPinned(e.target.checked);
            setSaved(false);
          }}
        />
        Fijar (el agente lo prioriza)
      </label>
      <div className="cal-modal-actions">
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        {saved && <span className="muted">Guardado ✓</span>}
        <button type="button" className="linkbtn task-delete" onClick={remove} disabled={pending}>
          Borrar
        </button>
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
