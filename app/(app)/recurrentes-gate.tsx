import { requireContext } from '@/lib/auth';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { todayInTz } from '@/lib/format';
import { RecurrentesPopup, type DueItem } from './recurrentes-popup';

/** Server: busca gastos recurrentes VENCIDOS (next_due_on <= hoy) y, si hay, monta el
 *  pop-up de rectificación. Se renderiza en el layout para aparecer en toda la app. */
export async function RecurrentesGate() {
  const { supabase, ctx } = await requireContext();
  const finance = financeRepo(supabase, ctx.userId);
  const [recurrentes, projects] = await Promise.all([
    finance.listRecurringExpenses(),
    workRepo(supabase, ctx.userId).listProjects(),
  ]);
  const today = todayInTz(ctx.tz);
  const projName = new Map(projects.map((p) => [p.id, p.title] as const));

  const due: DueItem[] = recurrentes
    .filter((r) => r.nextDueOn <= today)
    .map((r) => ({
      id: r.id,
      title: r.description || r.category || 'Gasto recurrente',
      projectTitle: projName.get(r.projectId) ?? '—',
      amountMinor: r.amountMinor,
      nextDueOn: r.nextDueOn,
    }));

  if (due.length === 0) return null;
  return <RecurrentesPopup items={due} />;
}
