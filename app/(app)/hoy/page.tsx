import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { todayInTz, dateInTz } from '@/lib/format';
import type { TaskRow } from '@/core/work/ports';
import { NewTaskForm } from './new-task-form';
import { TaskItem } from './task-item';

export const dynamic = 'force-dynamic';

export default async function HoyPage() {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const tasks = await repo.listTasks({ status: 'pending' });
  const today = todayInTz(ctx.tz);

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
      <h1 className="page-title">Hoy</h1>
      <NewTaskForm />

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
                  <TaskItem key={t.id} task={t} tz={ctx.tz} />
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
