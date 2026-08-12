'use client';

import { useState } from 'react';
import { Modal } from '../modal';
import { NewAreaForm } from './new-area-form';

/** Botón que abre la creación de área en un pop-up. */
export function AreaLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary launch-btn" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Nueva área
      </button>
      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Estructura" title="Nueva área" size="sm">
        <NewAreaForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
