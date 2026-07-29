import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { getDayEvents } from '@/lib/calendar-sync';
import { todayInTz, dateInTz } from '@/lib/format';
import type { TaskRow } from '@/core/work/ports';
import { detectarChoques } from '@/lib/agenda';
import { NewTaskForm } from './new-task-form';
import { TaskItem } from './task-item';
import { EventItem } from './event-item';
import { RealtimeRefresh } from '../realtime-refresh';
import { ChoquesBanner } from '../choques-banner';

export const dynamic = 'force-dynamic';

export default async function HoyPage() {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const today = todayInTz(ctx.tz);

  const [tasks, projects, events] = await Promise.all([
    repo.listTasks({ status: 'pending' }),
    repo.listProjects(),
    getDayEvents(supabase, ctx, today),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.title] as const));

  // Metas por proyecto, para el selector opcional del formulario de tareas.
  const goalsByProject: Record<string, { id: string; title: string }[]> = {};
  await Promise.all(
    projects.map(async (p) => {
      const gs = await repo.listGoals(p.id);
      goalsByProject[p.id] = gs.map((g) => ({ id: g.id, title: g.title }));
    }),
  );

  // Eventos de Google que NO son tareas de la app (evita duplicar).
  const { data: linked } = await supabase
    .from('tasks')
    .select('google_event_id')
    .not('google_event_id', 'is', null);
  const appEventIds = new Set(
    ((linked as { google_event_id: string }[] | null) ?? []).map((r) => r.google_event_id),
  );
  const calEvents = events.filter((e) => !appEventIds.has(e.id));

  const vencidas: TaskRow[] = [];
  const hoy: TaskRow[] = [];
  const proximas: TaskRow[] = [];
  const sinFecha: TaskRow[] = [];
  for (const t of tasks) {
    if (!t.dueAt) sinFecha.push(t);
    else {
      const d = dateInTz(t.dueAt, ctx.tz);
      if (d < today) vencidas.push(t);
      else if (d === today) hoy.push(t);
      else proximas.push(t);
    }
  }
  const sections: { label: string; items: TaskRow[]; tone?: 'danger' }[] = [
    { label: 'Vencidas', items: vencidas, tone: 'danger' },
    { label: 'Hoy', items: hoy },
    { label: 'Próximas', items: proximas },
    { label: 'Sin fecha', items: sinFecha },
  ];

  return (
    <div className="page">
      <RealtimeRefresh tables={['tasks', 'projects']} />
      <h1 className="page-title">Hoy</h1>
      <ChoquesBanner choques={detectarChoques(calEvents)} tz={ctx.tz} />
      <NewTaskForm
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        goalsByProject={goalsByProject}
      />

      {calEvents.length > 0 && (
        <section className="task-section">
          <h2 className="section-title">Calendario · {calEvents.length}</h2>
          <ul>
            {calEvents.map((e) => (
              <EventItem
                key={e.id}
                event={{
                  id: e.id,
                  summary: e.summary,
                  start: e.start,
                  allDay: e.allDay,
                  colorId: e.colorId,
                }}
                tz={ctx.tz}
              />
            ))}
          </ul>
        </section>
      )}

      {tasks.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          No tienes pendientes. Agrega uno arriba.
        </p>
      ) : (
        sections
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.label} className="task-section">
              <h2 className={`section-title${s.tone === 'danger' ? ' section-danger' : ''}`}>
                {s.label} · {s.items.length}
              </h2>
              <ul>
                {s.items.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    tz={ctx.tz}
                    projectName={t.projectId ? projectName.get(t.projectId) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
