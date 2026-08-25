import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { todayInTz } from '@/lib/format';
import { PageHero } from '../../page-hero';
import { agentBudgetAction } from '@/app/actions/finance';
import { SostenimientoManager } from './sostenimiento-manager';

export const dynamic = 'force-dynamic';

export default async function SostenimientoPage() {
  const { supabase, ctx } = await requireContext();
  const finance = financeRepo(supabase, ctx.userId);
  const [services, budget] = await Promise.all([finance.listSustaining(), agentBudgetAction()]);

  return (
    <div className="page">
      <Link href="/finanzas" className="back-link">
        ← Finanzas
      </Link>
      <PageHero
        eyebrow="Finanzas"
        title="Sostenimiento"
        subtitle="Lo que cuesta operar la app (y lo que podría costar), en un solo lugar."
      />
      <SostenimientoManager services={services} budget={budget} today={todayInTz(ctx.tz)} />
    </div>
  );
}
