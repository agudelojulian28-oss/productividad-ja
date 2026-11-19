import Link from 'next/link';
import type { SaludData } from '@/app/actions/health';
import { checklistForDay, routineForDay, streak } from '@/core/health/plan';
import { HealthChecklist } from '../salud/checklist';
import { SalIcon } from '../salud/icons';

/** Tarjeta del rail de Hoy: el checklist de salud del día + entreno que toca. */
export function SaludHoy({ data }: { data: SaludData }) {
  const { items, checkins, today } = data;
  const due = checklistForDay(items, today);
  const doneToday = checkins.filter((c) => c.day === today).map((c) => c.itemId);
  const rutina = routineForDay(items, today);
  const racha = streak(items, checkins, today);
  return (
    <div className="hoy-rail-card sl-hoy-card">
      <div className="hoy-rail-head">
        <span>Salud de hoy</span>
        <span className="sl-streak" title="Días seguidos al 100%">
          <span aria-hidden="true">{SalIcon.racha}</span>
          {racha}
        </span>
      </div>
      <p className="sl-hoy-train">
        <span aria-hidden="true">{SalIcon.entrenamiento}</span>
        {rutina ? rutina.title : 'Descanso'}
      </p>
      <HealthChecklist key={doneToday.join(',')} items={due} doneIds={doneToday} day={today} compact />
      <Link href="/salud" className="rt-link sl-hoy-link">
        Ver salud →
      </Link>
    </div>
  );
}
