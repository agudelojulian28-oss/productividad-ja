'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../modal';
import { RegistrarMovimiento } from './registrar-movimiento';

type Project = { id: string; title: string; areaId: string };

/**
 * Botón que abre el registro de movimiento en un pop-up (en vez del formulario
 * siempre visible). Al registrar con éxito cierra el modal y muestra un toast;
 * la lista de movimientos se refresca sola (revalidatePath en la acción).
 */
export function MovimientoLauncher({
  projects,
  today,
}: {
  projects: Project[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        className="btn-primary fin-launch"
        onClick={() => setOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        Registrar movimiento
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Finanzas"
        title="Registrar movimiento"
      >
        <RegistrarMovimiento
          projects={projects}
          today={today}
          onDone={(summary) => {
            setOpen(false);
            setToast(summary);
          }}
        />
      </Modal>

      {toast && (
        <div className="toast" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
