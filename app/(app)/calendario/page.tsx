import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { getRangeEvents } from '@/lib/calendar-sync';
import { todayInTz } from '@/lib/format';
import { detectarChoques } from '@/lib/agenda';
import { CalendarView, type CalItem, type CalView } from './calendar-view';
import { RealtimeRefresh } from '../realtime-refresh';
import { ChoquesBanner } from '../choques-banner';

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
  const today = todayInTz(ctx.tz);

  const sp = await searchParams;
  const view: CalView =
    sp.view === 'dia' || sp.view === 'mes' ? sp.view : sp.view === 'semana' ? 'semana' : 'semana';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : today;

  const { days } = resolveRange(view, date);
  const rangeStart = days[0]!;
  const rangeEnd = days[days.length - 1]!;

  // El calendario muestra SOLO eventos de Google (las tareas viven en la app, ADR-022).
  const repo = workRepo(supabase, ctx.userId);
  const [events, projects] = await Promise.all([
    getRangeEvents(supabase, ctx, rangeStart, rangeEnd),
    repo.listProjects(),
  ]);

  // Metas por proyecto, para el selector opcional al crear un evento.
  const goalsByProject: Record<string, { id: string; title: string }[]> = {};
  await Promise.all(
    projects.map(async (p) => {
      const gs = await repo.listGoals(p.id);
      goalsByProject[p.id] = gs.map((g) => ({ id: g.id, title: g.title }));
    }),
  );

  const items: CalItem[] = events.map(
    (e): CalItem => ({
      kind: 'event',
      id: e.id,
      title: e.summary,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      colorId: e.colorId,
      description: e.description,
      projectId: e.projectId,
      goalId: e.goalId,
    }),
  );

  return (
    <div className="page">
      <RealtimeRefresh tables={['tasks', 'projects']} />
      <ChoquesBanner choques={detectarChoques(events)} tz={ctx.tz} />
      <CalendarView
        view={view}
        date={date}
        today={today}
        tz={ctx.tz}
        items={items}
        days={days}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        goalsByProject={goalsByProject}
      />
    </div>
  );
}
