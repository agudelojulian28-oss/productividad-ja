import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { NewAreaForm } from './new-area-form';
import { RealtimeRefresh } from '../realtime-refresh';

export const dynamic = 'force-dynamic';

export default async function AreasPage() {
  const { supabase, ctx } = await requireContext();
  const repo = structureRepo(supabase, ctx.userId);
  const areas = await repo.listAreas();

  return (
    <div className="page">
      <RealtimeRefresh tables={['areas']} />
      <h1 className="page-title">Áreas</h1>
      <NewAreaForm />

      {areas.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Aún no tienes áreas. Crea la primera arriba (ej. &ldquo;Consultoría&rdquo;,
          &ldquo;Personal&rdquo;).
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
