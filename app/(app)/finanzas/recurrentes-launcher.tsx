'use client';

import { useState } from 'react';
import { RecurrentesPopup, type DueItem } from '../recurrentes-popup';

/**
 * Botón para abrir a demanda el pop-up de recurrentes vencidos (ingresos y gastos).
 * El pop-up también aparece solo al cargar la app; esto permite reabrirlo cuando quieras.
 */
export function RecurrentesLauncher({ due }: { due: DueItem[] }) {
  const [open, setOpen] = useState(false);
  const hay = due.length > 0;

  return (
    <div className="recur-launch">
      <button
        type="button"
        className="btn-ghost meta-add"
        onClick={() => setOpen(true)}
        disabled={!hay}
        title={hay ? undefined : 'No tienes recurrentes vencidos por registrar'}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {hay ? `Registrar recurrentes vencidos (${due.length})` : 'Sin recurrentes vencidos'}
      </button>

      {open && <RecurrentesPopup items={due} onClose={() => setOpen(false)} />}
    </div>
  );
}
