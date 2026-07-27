import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { getRangeEvents } from '@/lib/calendar-sync';
import { todayInTz } from '@/lib/format';
import { CalendarView, type CalItem, type CalView } from './calendar-view';
import { RealtimeRefresh } from '../realtime-refresh';

export const dynamic = 'force-dynamic';

/** Suma n días a un YYYY-MM-DD (ancla a mediodía UTC para evitar saltos de offset). */
function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Día de la semana con lunes = 0 … domingo = 6. */
function weekdayMon0(ymd: string): number {
  return (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function resolveRange(view: CalView, date: string): { start: string; days: string[] } {
  if (view === 'dia') return { start: date, days: [date] };
  if (view === 'semana') {
    const start = addDaysYmd(date, -weekdayMon0(date));
    return { start, days: Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i)) };
  }
  // mes: cuadrícula de 6 semanas que cubre el mes de `date`.
  const first = `${date.slice(0, 8)}01`;
  const start = addDaysYmd(first, -weekdayMon0(first));
  return { start, days: Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i)) };
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const today = todayInTz(ctx.tz);

  const sp = await searchParams;
  const view: CalView =
    sp.view === 'dia' || sp.view === 'mes' ? sp.view : sp.view === 'semana' ? 'semana' : 'semana';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : today;

  const { days } = resolveRange(view, date);
  const rangeStart = days[0]!;
  const rangeEnd = days[days.length - 1]!;

  // Fin exclusivo del rango en ISO para filtrar tareas por dueAt.
  const dueFrom = `${rangeStart}T00:00:00`;
  const dueTo = `${rangeEnd}T23:59:59`;

  const [events, tasks] = await Promise.all([
    getRangeEvents(supabase, ctx, rangeStart, rangeEnd),
    repo.listTasks({ status: 'pending', dueFrom, dueTo }),
  ]);

  // Eventos de Google que ya son tareas de la app (evita duplicar).
  const { data: linked } = await supabase
    .from('tasks')
    .select('google_event_id')
    .not('google_event_id', 'is', null);
  const appEventIds = new Set(
    ((linked as { google_event_id: string }[] | null) ?? []).map((r) => r.google_event_id),
  );

  const items: CalItem[] = [
    ...events
      .filter((e) => !appEventIds.has(e.id))
      .map(
        (e): CalItem => ({
          kind: 'event',
          id: e.id,
          title: e.summary,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          colorId: e.colorId,
          description: e.description,
        }),
      ),
    ...tasks
      .filter((t) => t.dueAt)
      .map(
        (t): CalItem => ({
          kind: 'task',
          id: t.id,
          title: t.title,
          start: t.dueAt,
          end: null,
          allDay: false,
          colorId: null,
          description: t.notes,
        }),
      ),
  ];

  return (
    <div className="page">
      <RealtimeRefresh tables={['tasks', 'projects']} />
      <CalendarView
        view={view}
        date={date}
        today={today}
        tz={ctx.tz}
        items={items}
        days={days}
      />
    </div>
  );
}
