import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { NewProjectForm } from './new-project-form';
import { DescriptionEditor } from '../../description-editor';
import { PageHero } from '../../page-hero';
import { setAreaDescriptionAction } from '@/app/actions/areas';

export const dynamic = 'force-dynamic';

export default async function AreaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const area = await structureRepo(supabase, ctx.userId).getArea(id);
  if (!area) notFound();
  const repo = workRepo(supabase, ctx.userId);
  const projects = await repo.listProjects(id);

  // Progreso por proyecto (tareas hechas / total).
  const rows = await Promise.all(
    projects.map(async (p) => {
      const tasks = await repo.listTasks({ projectId: p.id });
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === 'done').length;
      return { p, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
    }),
  );
  const areaDone = rows.reduce((s, r) => s + r.done, 0);
  const areaTotal = rows.reduce((s, r) => s + r.total, 0);
  const areaPct = areaTotal ? Math.round((areaDone / areaTotal) * 100) : 0;

  return (
    <div className="page">
      <Link href="/areas" className="back-link">
        ← Áreas
      </Link>
      <PageHero
        eyebrow="Área"
        title={area.name}
        kpis={
          areaTotal > 0
            ? [{ label: 'Progreso', value: `${areaPct}%`, tone: areaPct === 100 ? 'pos' : 'acc' }]
            : undefined
        }
      />
      <DescriptionEditor
        initial={area.description ?? ''}
        action={setAreaDescriptionAction.bind(null, area.id)}
      />

      {areaTotal > 0 && (
        <div className="goal-progress" style={{ marginTop: 16 }}>
          <div className="goal-progress-head">
            <span>
              Progreso del área · {areaDone}/{areaTotal} tareas
            </span>
            <span>{areaPct}%</span>
          </div>
          <div className="goal-bar">
            <div className="goal-bar-fill" style={{ width: `${areaPct}%` }} />
          </div>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Proyectos
      </h2>
      <NewProjectForm areaId={area.id} />

      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Sin proyectos todavía. Crea el primero arriba.
        </p>
      ) : (
        <ul style={{ marginTop: 16 }}>
          {rows.map(({ p, total, done, pct }) => (
            <li key={p.id} className="row-card">
              <div className="task-body">
                <Link href={`/proyectos/${p.id}`} className="task-title">
                  {p.title}
                </Link>
                <span className="task-meta">
                  {total === 0 ? 'Sin tareas' : `${done}/${total} tareas · ${pct}%`}
                </span>
                {total > 0 && (
                  <div className="goal-bar" style={{ marginTop: 6 }}>
                    <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <span className="pill">{p.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
