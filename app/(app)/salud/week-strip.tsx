import type { HealthItemRow } from '@/core/health/ports';
import { WEEKDAY_SHORT, WEEKDAY_LONG, isoWeekday, weekSchedule } from '@/core/health/plan';

/** Semana de entrenamiento L..D: la rutina de cada día (o descanso), hoy resaltado. */
export function WeekStrip({ items, today }: { items: HealthItemRow[]; today: string }) {
  const sched = weekSchedule(items);
  const hoy = isoWeekday(today);
  return (
    <ol className="sl-week" aria-label="Semana de entrenamiento">
      {sched.map((r, i) => {
        const day = i + 1;
        const short = r ? r.title.split('·')[0]!.trim() : '—';
        return (
          <li
            key={day}
            className={`sl-week-day${day === hoy ? ' today' : ''}${r ? '' : ' rest'}`}
            aria-current={day === hoy ? 'date' : undefined}
          >
            <span className="sl-week-d">{WEEKDAY_SHORT[i]}</span>
            <span className="sl-week-r">{short}</span>
            <span className="sr-only">
              {WEEKDAY_LONG[i]}: {r ? r.title : 'descanso'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
