'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './modal';
import { NewTaskForm } from './hoy/new-task-form';
import { RegistrarMovimiento } from './finanzas/registrar-movimiento';
import { EventEditor } from './calendario/event-editor';

type Project = { id: string; title: string };
type MovProject = { id: string; title: string; areaId: string };

export type QuickData = {
  projects: Project[];
  goalsByProject: Record<string, { id: string; title: string }[]>;
  movProjects: MovProject[];
  today: string;
  tz: string;
};

/**
 * Acceso rápido: abre los pop-ups y acciones que YA existen. No añade backend ni
 * cambia funcionalidad. `variant='sidebar'` lo compacta para el panel izquierdo.
 */
export function QuickActions({
  projects,
  goalsByProject,
  movProjects,
  today,
  tz,
  variant,
}: QuickData & { variant?: 'sidebar' }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | 'tarea' | 'mov' | 'evento'>(null);
  const cls = `quick${variant === 'sidebar' ? ' quick-sb' : ''}`;

  return (
    <div className={cls}>
      <button type="button" className="quick-tile" onClick={() => setOpen('tarea')}>
        <span className="quick-ic quick-ic-task">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
            <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="quick-label">Nueva tarea</span>
      </button>

      {movProjects.length > 0 && (
        <button type="button" className="quick-tile" onClick={() => setOpen('mov')}>
          <span className="quick-ic quick-ic-mov">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="quick-label">Registrar dinero</span>
        </button>
      )}

      <button type="button" className="quick-tile" onClick={() => setOpen('evento')}>
        <span className="quick-ic quick-ic-cal">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="quick-label">Nuevo evento</span>
      </button>

      <Link href="/chat" className="quick-tile">
        <span className="quick-ic quick-ic-chat">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 013.6-11.3 8.38 8.38 0 0112.5 7.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="quick-label">Preguntar</span>
      </Link>

      <Modal open={open === 'tarea'} onClose={() => setOpen(null)} eyebrow="Capturar" title="Nueva tarea">
        <NewTaskForm projects={projects} goalsByProject={goalsByProject} onDone={() => setOpen(null)} />
      </Modal>
      <Modal open={open === 'mov'} onClose={() => setOpen(null)} eyebrow="Finanzas" title="Registrar movimiento">
        <RegistrarMovimiento
          projects={movProjects}
          today={today}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      </Modal>

      {open === 'evento' && (
        <EventEditor
          target={{ mode: 'create', slotIso: new Date().toISOString() }}
          tz={tz}
          projects={projects}
          goalsByProject={goalsByProject}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
