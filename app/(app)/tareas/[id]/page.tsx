import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { timeInTz, dayLabelInTz } from '@/lib/format';
import { PageHero } from '../../page-hero';
import { TaskEditor } from './task-editor';

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

  const [project, goal, projects] = await Promise.all([
    task.projectId ? repo.getProject(task.projectId) : Promise.resolve(null),
    task.goalId ? repo.getGoal(task.goalId) : Promise.resolve(null),
    repo.listProjects(),
  ]);
  // Metas de todos los proyectos (para el selector; se filtran por proyecto en el cliente).
  const goalsByProject = await Promise.all(projects.map((p) => repo.listGoals(p.id)));
  const goals = goalsByProject.flat().map((g) => ({ id: g.id, title: g.title, projectId: g.projectId }));

  const cuando = task.dueAt
    ? `${dayLabelInTz(task.dueAt, ctx.tz)} · ${timeInTz(task.dueAt, ctx.tz)}`
    : 'Sin fecha';
  const estado = task.status === 'done' ? 'Hecha' : task.status === 'cancelled' ? 'Cancelada' : 'Pendiente';

  return (
    <div className="page">
      <Link href="/hoy" className="back-link">
        ← Hoy
      </Link>
      <PageHero eyebrow="Tarea" title={task.title} subtitle={`${cuando} · ${estado}`} />
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

      <TaskEditor
        task={{
          id: task.id,
          title: task.title,
          notes: task.notes,
          dueAt: task.dueAt,
          projectId: task.projectId,
          goalId: task.goalId,
          status: task.status,
        }}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        goals={goals}
      />
    </div>
  );
}
