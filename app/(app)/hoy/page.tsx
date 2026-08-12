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
import { PageHero, type Kpi } from '../page-hero';
import { EmptyState, emptyIcons } from '../empty-state';

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

  const totalPend = tasks.length;

  const fechaRaw = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ctx.tz,
  }).format(new Date());
  const fecha = fechaRaw.charAt(0).toUpperCase() + fechaRaw.slice(1);

  const kpis: Kpi[] = [{ label: 'Por hacer hoy', value: String(hoy.length), tone: 'acc' }];
  if (vencidas.length > 0)
    kpis.push({ label: 'Vencidas', value: String(vencidas.length), tone: 'neg' });
  if (calEvents.length > 0) kpis.push({ label: 'Eventos', value: String(calEvents.length) });

  return (
    <div className="page">
      <RealtimeRefresh tables={['tasks', 'projects']} />
      <PageHero
        eyebrow={fecha}
        title="Hoy"
        subtitle={
          totalPend === 0
            ? 'Sin pendientes. Captura algo nuevo cuando quieras.'
            : `${hoy.length} para hoy · ${vencidas.length} vencidas · ${calEvents.length} eventos`
        }
        kpis={kpis}
      />
      <ChoquesBanner choques={detectarChoques(calEvents)} tz={ctx.tz} />

      <div className="hoy-grid">
        {/* Rail: captura + agenda del día. En móvil va arriba (orden de captura). */}
        <div className="hoy-rail">
          <NewTaskForm
            projects={projects.map((p) => ({ id: p.id, title: p.title }))}
            goalsByProject={goalsByProject}
          />

          <div className="hoy-rail-card">
            <div className="hoy-rail-head">
              <span>Agenda de hoy</span>
              <span className="hoy-rail-count">{calEvents.length}</span>
            </div>
            {calEvents.length === 0 ? (
              <p className="muted hoy-rail-empty">Sin eventos en el calendario.</p>
            ) : (
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
            )}
          </div>
        </div>

        {/* Main: las tareas, el foco del trabajo. En escritorio, columna izquierda. */}
        <div className="hoy-main">
          {totalPend === 0 ? (
            <EmptyState
              icon={emptyIcons.tasks}
              title="Todo al día"
              hint="No tienes pendientes. Captura uno nuevo desde el recuadro de arriba o pídeselo al asistente."
            />
          ) : (
            sections
              .filter((s) => s.items.length > 0)
              .map((s) => (
                <section key={s.label} className="task-section">
                  <h2
                    className={`section-title${s.tone === 'danger' ? ' section-danger' : ''}`}
                  >
                    {s.label} · {s.items.length}
                  </h2>
                  <ul>
                    {s.items.map((t) => (
                      <TaskItem
                        key={t.id}
                        task={t}
                        tz={ctx.tz}
                        projectName={
                          t.projectId ? projectName.get(t.projectId) : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
