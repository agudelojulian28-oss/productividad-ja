import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { dayLabelInTz, todayInTz } from '@/lib/format';
import { DescriptionEditor } from '../../description-editor';
import { GoalFactorsForm } from './goal-factors-form';
import { setGoalDescriptionAction } from '@/app/actions/goals';

export const dynamic = 'force-dynamic';

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const goal = await repo.getGoal(id);
  if (!goal) notFound();

  const tasks = await repo.listTasks({ goalId: id });
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const completa = total > 0 && done === total;
  const vencida = goal.periodEnd < todayInTz(ctx.tz) && !completa;

  return (
    <div className="page">
      <Link href={goal.projectId ? `/proyectos/${goal.projectId}` : '/areas'} className="back-link">
        ← Volver
      </Link>
      <h1 className="page-title">{goal.title}</h1>

      <div className="goal-progress">
        <div className="goal-progress-head">
          <span>
            Progreso · {done}/{total} tareas
          </span>
          <span>{pct}%</span>
        </div>
        <div className="goal-bar">
          <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Cantidad objetivo: {goal.targetValue} · Inicio: {goal.periodStart} · Cumplimiento
          esperado:{' '}
          <span className={vencida ? 'overdue' : undefined}>
            {goal.periodEnd}
            {vencida ? ' (vencida)' : ''}
          </span>
        </p>
      </div>

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Cantidad y tiempo
      </h2>
      <GoalFactorsForm
        goalId={goal.id}
        targetValue={goal.targetValue}
        startDate={goal.periodStart}
        deadline={goal.periodEnd}
      />

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Descripción
      </h2>
      <DescriptionEditor
        initial={goal.description ?? ''}
        action={setGoalDescriptionAction.bind(null, goal.id)}
      />

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Tareas
      </h2>
      {tasks.length === 0 ? (
        <p className="muted">Sin tareas en esta meta todavía.</p>
      ) : (
        <ul style={{ marginTop: 8 }}>
          {tasks.map((t) => (
            <li key={t.id} className="row-card">
              <Link href={`/tareas/${t.id}`} className="task-title">
                {t.title}
              </Link>
              <span className="pill">
                {t.status === 'done' ? 'hecha' : t.dueAt ? dayLabelInTz(t.dueAt, ctx.tz) : 'pendiente'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
