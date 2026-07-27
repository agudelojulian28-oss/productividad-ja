import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { NewGoalForm } from './new-goal-form';
import { DescriptionEditor } from '../../description-editor';
import { setProjectDescriptionAction } from '@/app/actions/projects';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const project = await repo.getProject(id);
  if (!project) notFound();
  const goals = await repo.listGoals(id);

  return (
    <div className="page">
      <Link href={project.areaId ? `/areas/${project.areaId}` : '/areas'} className="back-link">
        ← Volver
      </Link>
      <h1 className="page-title">{project.title}</h1>
      <DescriptionEditor
        initial={project.description ?? ''}
        action={setProjectDescriptionAction.bind(null, project.id)}
      />

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Metas
      </h2>
      <NewGoalForm projectId={project.id} />

      {goals.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Sin metas todavía. Las tareas pueden ir sin meta.
        </p>
      ) : (
        <ul style={{ marginTop: 16 }}>
          {goals.map((g) => (
            <li key={g.id} className="row-card">
              <Link href={`/metas/${g.id}`} className="task-title">
                {g.title}
              </Link>
              <span className="pill">{g.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
