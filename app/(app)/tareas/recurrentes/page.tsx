import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { PageHero } from '../../page-hero';
import { RecurringTasksManager, type RecurRow } from './recurring-tasks-manager';

export const dynamic = 'force-dynamic';

export default async function RecurringTasksPage() {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);

  const [recurrentes, projects] = await Promise.all([repo.listRecurringTasks(), repo.listProjects()]);
  const goalsByProject = await Promise.all(projects.map((p) => repo.listGoals(p.id)));
  const goals = goalsByProject.flat().map((g) => ({ id: g.id, title: g.title, projectId: g.projectId }));

  const rows: RecurRow[] = recurrentes.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    projectId: r.projectId,
    goalId: r.goalId,
    frequency: r.frequency,
    dueTime: r.dueTime,
    nextDueOn: r.nextDueOn,
  }));

  return (
    <div className="page">
      <Link href="/hoy" className="back-link">
        ← Hoy
      </Link>
      <PageHero
        eyebrow="Tareas"
        title="Recurrentes"
        subtitle="Plantillas que se convierten en tarea sola al llegar su fecha."
      />
      <RecurringTasksManager
        recurrentes={rows}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        goals={goals}
      />
    </div>
  );
}
