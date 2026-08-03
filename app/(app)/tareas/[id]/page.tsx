import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { timeInTz, dayLabelInTz } from '@/lib/format';
import { DescriptionEditor } from '../../description-editor';
import { PageHero } from '../../page-hero';
import { setTaskDescriptionAction } from '@/app/actions/tasks';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const task = await repo.getTask(id);
  if (!task) notFound();

  const [project, goal] = await Promise.all([
    task.projectId ? repo.getProject(task.projectId) : Promise.resolve(null),
    task.goalId ? repo.getGoal(task.goalId) : Promise.resolve(null),
  ]);

  const cuando = task.dueAt
    ? `${dayLabelInTz(task.dueAt, ctx.tz)} · ${timeInTz(task.dueAt, ctx.tz)}`
    : 'Sin fecha';

  return (
    <div className="page">
      <Link href="/hoy" className="back-link">
        ← Hoy
      </Link>
      <PageHero eyebrow="Tarea" title={task.title} subtitle={`${cuando} · ${task.status}`} />
      {(project || goal) && (
        <p className="muted" style={{ marginBottom: 16 }}>
          {project && (
            <Link href={`/proyectos/${project.id}`} className="crumb">
              {project.title}
            </Link>
          )}
          {project && goal && ' › '}
          {goal && (
            <Link href={`/metas/${goal.id}`} className="crumb">
              {goal.title}
            </Link>
          )}
        </p>
      )}
      <DescriptionEditor
        initial={task.notes ?? ''}
        action={setTaskDescriptionAction.bind(null, task.id)}
      />
    </div>
  );
}
