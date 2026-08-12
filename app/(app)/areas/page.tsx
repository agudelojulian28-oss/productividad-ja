import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { AreaLauncher } from './area-launcher';
import { PageHero } from '../page-hero';
import { RealtimeRefresh } from '../realtime-refresh';

export const dynamic = 'force-dynamic';

export default async function AreasPage() {
  const { supabase, ctx } = await requireContext();
  const repo = structureRepo(supabase, ctx.userId);
  const areas = await repo.listAreas();

  return (
    <div className="page">
      <RealtimeRefresh tables={['areas']} />
      <PageHero
        eyebrow="Estructura"
        title="Áreas"
        subtitle="Tus contextos de trabajo y de vida. Los proyectos y el dinero cuelgan de aquí."
        kpis={areas.length > 0 ? [{ label: 'Áreas', value: String(areas.length) }] : undefined}
        actions={<AreaLauncher />}
      />

      {areas.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Aún no tienes áreas. Crea la primera con &ldquo;Nueva área&rdquo; (ej.
          &ldquo;Consultoría&rdquo;, &ldquo;Personal&rdquo;).
        </p>
      ) : (
        <ul style={{ marginTop: 16 }}>
          {areas.map((a) => (
            <li key={a.id}>
              <Link href={`/areas/${a.id}`} className="row-card">
                <span className="task-title">{a.name}</span>
                <span className={`pill pill-${a.kind}`}>{a.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
