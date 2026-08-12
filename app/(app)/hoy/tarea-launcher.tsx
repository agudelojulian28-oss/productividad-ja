'use client';

import { useState } from 'react';
import { Modal } from '../modal';
import { NewTaskForm } from './new-task-form';

/** Botón que abre la captura de tarea en un pop-up. */
export function TareaLauncher({
  projects,
  goalsByProject,
}: {
  projects: { id: string; title: string }[];
  goalsByProject: Record<string, { id: string; title: string }[]>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary launch-btn" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Nueva tarea
      </button>
      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Capturar" title="Nueva tarea">
        <NewTaskForm
          projects={projects}
          goalsByProject={goalsByProject}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
