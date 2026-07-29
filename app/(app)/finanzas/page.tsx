import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { todayInTz } from '@/lib/format';
import { RealtimeRefresh } from '../realtime-refresh';
import { RegistrarMovimiento } from './registrar-movimiento';
import { FuentesManager } from './fuentes-manager';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const finance = financeRepo(supabase, ctx.userId);

  const [areas, sources] = await Promise.all([
    structure.listAreas(),
    finance.listIncomeSources(),
  ]);

  const areaOpts = areas.map((a) => ({ id: a.id, name: a.name }));
  const sourceOpts = sources.map((s) => ({
    id: s.id,
    name: s.name,
    areaId: s.areaId,
    model: s.model,
  }));

  return (
    <div className="page">
      <RealtimeRefresh tables={['transactions', 'income_sources']} />
      <h1 className="page-title">Finanzas</h1>

      {areas.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          Primero crea un área en{' '}
          <Link href="/areas" className="link">
            Áreas
          </Link>
          . El dinero cuelga de un área.
        </p>
      ) : (
        <>
          <section className="fin-section">
            <h2 className="fin-h2">Registrar movimiento</h2>
            <RegistrarMovimiento
              areas={areaOpts}
              sources={sourceOpts}
              today={todayInTz(ctx.tz)}
            />
          </section>

          <section className="fin-section">
            <h2 className="fin-h2">Fuentes de ingreso</h2>
            <FuentesManager areas={areaOpts} sources={sourceOpts} />
          </section>
        </>
      )}
    </div>
  );
}
