import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { dayLabelInTz } from '@/lib/format';
import { getEventsByProject } from '@/lib/calendar-sync';
import { NewGoalForm } from './new-goal-form';
import { DescriptionEditor } from '../../description-editor';
import { Disclosure } from '../../disclosure';
import { NewDocForm } from '../../docs/new-doc-form';
import { setProjectDescriptionAction } from '@/app/actions/projects';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { signedUrl } from '@/adapters/supabase/storage';

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
  const [goals, tasks, events, docs, attachments] = await Promise.all([
    repo.listGoals(id),
    repo.listTasks({ projectId: id }),
    getEventsByProject(supabase, ctx, id),
    structure.listDocuments({ projectId: id }),
    structure.listSavedAttachments(id),
  ]);
  const goalName = new Map(goals.map((g) => [g.id, g.title] as const));

  // URLs firmadas para ver las imágenes del bucket privado.
  const fotos = (
    await Promise.all(
      attachments.map(async (a) => ({
        id: a.id,
        description: a.description,
        url: await signedUrl(supabase, a.storagePath),
      })),
    )
  ).filter((f): f is { id: string; description: string | null; url: string } => f.url !== null);

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

      <Disclosure title="Metas" count={goals.length}>
        <NewGoalForm projectId={project.id} />
        {goals.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
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
      </Disclosure>

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

      <Disclosure title="Eventos" count={events.length}>
        {events.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Sin eventos en este proyecto. (Crea eventos desde el calendario o el chat y
            asígnalos aquí.)
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
      </Disclosure>

      {fotos.length > 0 && (
        <Disclosure title="Fotos" count={fotos.length}>
          <div className="foto-grid">
            {fotos.map((f) => (
              <figure key={f.id} className="foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.description ?? 'foto'} />
                {f.description && <figcaption>{f.description}</figcaption>}
              </figure>
            ))}
          </div>
        </Disclosure>
      )}

      <Disclosure title="Documentación" count={docs.length}>
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
      </Disclosure>
    </div>
  );
}
