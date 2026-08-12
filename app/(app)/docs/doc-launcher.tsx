'use client';

import { useState } from 'react';
import { Modal } from '../modal';
import { NewDocForm } from './new-doc-form';

type Area = { id: string; name: string };
type Project = { id: string; title: string };

/** Botón que abre la creación de documento en un pop-up. */
export function DocLauncher({
  areas = [],
  projects = [],
}: {
  areas?: Area[];
  projects?: Project[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary launch-btn" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Nuevo documento
      </button>
      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Tu método" title="Nuevo documento">
        <NewDocForm areas={areas} projects={projects} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
