import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import type { DocumentRow } from '@/core/structure/ports';
import { RealtimeRefresh } from '../realtime-refresh';
import { PageHero } from '../page-hero';
import { DocLauncher } from './doc-launcher';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  proceso: 'Proceso',
  preferencia: 'Preferencia',
  nota: 'Nota',
};

function DocRow({ d }: { d: DocumentRow }) {
  return (
    <li className="row-card">
      <Link href={`/docs/${d.id}`} className="task-title">
        {d.pinned ? '📌 ' : ''}
        {d.title}
      </Link>
      <span className="muted" style={{ fontSize: 12 }}>
        {KIND_LABEL[d.kind] ?? d.kind} · {d.author === 'agente' ? 'agente' : 'tú'}
      </span>
    </li>
  );
}

export default async function DocsPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const work = workRepo(supabase, ctx.userId);

  const [docs, areas, projects] = await Promise.all([
    structure.listDocuments(),
    structure.listAreas(),
    work.listProjects(),
  ]);

  const projTitle = new Map(projects.map((p) => [p.id, p.title] as const));
  const areaName = new Map(areas.map((a) => [a.id, a.name] as const));

  const global = docs.filter((d) => !d.projectId && !d.areaId);
  const byProject = new Map<string, DocumentRow[]>();
  const byArea = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    if (d.projectId) byProject.set(d.projectId, [...(byProject.get(d.projectId) ?? []), d]);
    else if (d.areaId) byArea.set(d.areaId, [...(byArea.get(d.areaId) ?? []), d]);
  }

  return (
    <div className="page">
      <RealtimeRefresh tables={['documents']} />
      <PageHero
        eyebrow="Tu método"
        title="Documentación"
        subtitle="Cómo te gusta que se hagan las cosas. El agente lo consulta y lo alimenta."
        kpis={docs.length > 0 ? [{ label: 'Documentos', value: String(docs.length) }] : undefined}
        actions={
          <DocLauncher
            areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            projects={projects.map((p) => ({ id: p.id, title: p.title }))}
          />
        }
      />

      {docs.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Aún no hay documentos. Crea el primero con &ldquo;Nuevo documento&rdquo; (ej.
          &ldquo;Cómo cotizo&rdquo;).
        </p>
      ) : (
        <>
          {global.length > 0 && (
            <section className="fin-block">
              <h2 className="fin-h2">Método global</h2>
              <ul>{global.map((d) => <DocRow key={d.id} d={d} />)}</ul>
            </section>
          )}
          {[...byProject.entries()].map(([pid, list]) => (
            <section key={pid} className="fin-block">
              <h2 className="fin-h2">Proyecto: {projTitle.get(pid) ?? '—'}</h2>
              <ul>{list.map((d) => <DocRow key={d.id} d={d} />)}</ul>
            </section>
          ))}
          {[...byArea.entries()].map(([aid, list]) => (
            <section key={aid} className="fin-block">
              <h2 className="fin-h2">Área: {areaName.get(aid) ?? '—'}</h2>
              <ul>{list.map((d) => <DocRow key={d.id} d={d} />)}</ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
