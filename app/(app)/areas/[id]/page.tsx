import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { NewProjectForm } from './new-project-form';
import { DescriptionEditor } from '../../description-editor';
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
  const projects = await workRepo(supabase, ctx.userId).listProjects(id);

  return (
    <div className="page">
      <Link href="/areas" className="back-link">
        ← Áreas
      </Link>
      <h1 className="page-title">{area.name}</h1>
      <DescriptionEditor
        initial={area.description ?? ''}
        action={setAreaDescriptionAction.bind(null, area.id)}
      />

      <h2 className="section-title" style={{ marginTop: 20 }}>
        Proyectos
      </h2>
      <NewProjectForm areaId={area.id} />

      {projects.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Sin proyectos todavía. Crea el primero arriba.
        </p>
      ) : (
        <ul style={{ marginTop: 16 }}>
          {projects.map((p) => (
            <li key={p.id} className="row-card">
              <Link href={`/proyectos/${p.id}`} className="task-title">
                {p.title}
              </Link>
              <span className="pill">{p.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
