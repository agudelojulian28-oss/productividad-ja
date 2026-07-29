import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { dayLabelInTz } from '@/lib/format';
import { getEventsByProject } from '@/lib/calendar-sync';
import { NewGoalForm } from './new-goal-form';
import { DescriptionEditor } from '../../description-editor';
import { NewDocForm } from '../../docs/new-doc-form';
import { setProjectDescriptionAction } from '@/app/actions/projects';
import { structureRepo } from '@/adapters/supabase/structure-repo';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const structure = structureRepo(supabase, ctx.userId);
  const project = await repo.getProject(id);
  if (!project) notFound();
  const [goals, tasks, events, docs] = await Promise.all([
    repo.listGoals(id),
    repo.listTasks({ projectId: id }),
    getEventsByProject(supabase, ctx, id),
    structure.listDocuments({ projectId: id }),
  ]);
  const goalName = new Map(goals.map((g) => [g.id, g.title] as const));

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

      <h2 className="section-title" style={{ marginTop: 24 }}>
        Tareas · {tasks.length}
      </h2>
      {tasks.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Sin tareas en este proyecto todavía.
        </p>
      ) : (
        <ul style={{ marginTop: 8 }}>
          {tasks.map((t) => (
            <li key={t.id} className="row-card">
              <div className="task-body">
                <Link href={`/tareas/${t.id}`} className="task-title">
                  {t.title}
                </Link>
                <span className="task-meta">
                  {t.goalId ? `Meta: ${goalName.get(t.goalId) ?? '—'}` : 'Sin meta'}
                  {t.dueAt ? ` · ${dayLabelInTz(t.dueAt, ctx.tz)}` : ''}
                </span>
              </div>
              <span className="pill">{t.status === 'done' ? 'hecha' : 'pendiente'}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title" style={{ marginTop: 24 }}>
        Eventos · {events.length}
      </h2>
      {events.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Sin eventos en este proyecto. (Crea eventos desde el calendario o el chat y asígnalos aquí.)
        </p>
      ) : (
        <ul style={{ marginTop: 8 }}>
          {events.map((e) => (
            <li key={e.id} className="row-card">
              <span className="task-title">{e.summary}</span>
              <span className="pill">
                {e.start ? dayLabelInTz(e.start, ctx.tz) : 'evento'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title" style={{ marginTop: 24 }}>
        Documentación · {docs.length}
      </h2>
      <NewDocForm fixedProjectId={project.id} />
      {docs.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Sin documentación de este proyecto. Documenta aquí cómo se hace su trabajo.
        </p>
      ) : (
        <ul style={{ marginTop: 8 }}>
          {docs.map((d) => (
            <li key={d.id} className="row-card">
              <Link href={`/docs/${d.id}`} className="task-title">
                {d.pinned ? '📌 ' : ''}
                {d.title}
              </Link>
              <span className="pill">{d.author === 'agente' ? 'agente' : 'tú'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
