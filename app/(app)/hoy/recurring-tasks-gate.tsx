'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { generateDueRecurringTasksAction } from '@/app/actions/tasks';

/** Al abrir Hoy, materializa las tareas recurrentes vencidas (aparecen solas). Si creó
 *  alguna, refresca para que se vean. Escritura por acción, no en el GET. */
export function RecurringTasksGate() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    generateDueRecurringTasksAction()
      .then((n) => {
        if (n > 0) router.refresh();
      })
      .catch(() => {
        /* si falla, se reintenta en la próxima carga */
      });
  }, [router]);
  return null;
}
