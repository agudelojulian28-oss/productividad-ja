// Orquestación Salud → Finanzas: el total mensual de la lista de mercado se mantiene como
// UN gasto fijo ("Mercado · dieta") en el proyecto de salud. Vive fuera del core para que
// core/health no dependa de core/finance. La usan las acciones de la app y el agente
// (recibe los repos por parámetro: no toca adaptadores).

import type { ActorContext } from '@/core/types';
import type { HealthRepo } from '@/core/health/ports';
import type { FinanceRepo } from '@/core/finance/ports';
import type { WorkRepo } from '@/core/work/ports';
import type { StructureRepo } from '@/core/structure/ports';
import { groceryMonthlyMinor } from '@/core/health/plan';
import { createRecurringExpense, updateRecurringExpense } from '@/core/finance/recurring';

export const MERCADO_DESC = 'Mercado · dieta';

export interface MercadoDeps {
  health: HealthRepo;
  finance: FinanceRepo;
  work: WorkRepo;
  structure?: StructureRepo;
}
export interface MercadoSync {
  monthlyMinor: number;
  recurringId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  synced: boolean; // hay un gasto fijo activo con el total actual
}

function firstOfNextMonth(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Proyecto al que se atribuye el mercado: el configurado, o uno llamado "Salud"; si no
 *  existe, crea área + proyecto "Salud" (una vez) y lo recuerda en los ajustes. */
export async function ensureMercadoProject(
  deps: MercadoDeps,
): Promise<{ id: string; title: string; areaId: string } | null> {
  const settings = await deps.health.getSettings();
  if (settings?.groceryProjectId) {
    const p = await deps.work.getProject(settings.groceryProjectId);
    if (p?.areaId) return { id: p.id, title: p.title, areaId: p.areaId };
  }
  const projects = await deps.work.listProjects();
  let project = projects.find((p) => p.title.trim().toLowerCase() === 'salud' && p.areaId) ?? null;
  if (!project && deps.structure) {
    const areas = await deps.structure.listAreas();
    const area =
      areas.find((a) => a.name.trim().toLowerCase() === 'salud') ??
      (await deps.structure.insertArea({ name: 'Salud', kind: 'personal' }));
    project = await deps.work.insertProject({ title: 'Salud', areaId: area.id });
  }
  if (!project?.areaId) return null;
  await deps.health.upsertSettings({ groceryProjectId: project.id });
  return { id: project.id, title: project.title, areaId: project.areaId };
}

/** Recalcula el total de la lista y lo refleja en el gasto fijo. Si el total es 0, lo
 *  desactiva (no se registran gastos en cero); si vuelve a tener costo, lo reactiva. */
export async function syncMercado(ctx: ActorContext, deps: MercadoDeps, today: string): Promise<MercadoSync> {
  const monthlyMinor = groceryMonthlyMinor(await deps.health.listGroceries());
  const project = await ensureMercadoProject(deps);
  if (!project) return { monthlyMinor, recurringId: null, projectId: null, projectTitle: null, synced: false };

  const settings = await deps.health.getSettings();
  let rec = settings?.groceryRecurringId ? await deps.finance.getRecurringExpense(settings.groceryRecurringId) : null;

  // Si cambiaste el proyecto del mercado, el gasto viejo se desactiva y se crea otro.
  if (rec && rec.projectId !== project.id) {
    await updateRecurringExpense(ctx, deps.finance, { id: rec.id, active: false });
    rec = null;
  }

  if (monthlyMinor <= 0) {
    if (rec?.active) await updateRecurringExpense(ctx, deps.finance, { id: rec.id, active: false });
    return { monthlyMinor, recurringId: rec?.id ?? null, projectId: project.id, projectTitle: project.title, synced: false };
  }

  if (rec) {
    await updateRecurringExpense(ctx, deps.finance, {
      id: rec.id,
      amountMinor: monthlyMinor,
      frequency: 'mensual',
      description: MERCADO_DESC,
      category: 'Mercado',
      active: true,
    });
    return { monthlyMinor, recurringId: rec.id, projectId: project.id, projectTitle: project.title, synced: true };
  }

  const created = await createRecurringExpense(ctx, deps.finance, {
    direction: 'out',
    projectId: project.id,
    areaId: project.areaId,
    amountMinor: monthlyMinor,
    category: 'Mercado',
    description: MERCADO_DESC,
    frequency: 'mensual',
    nextDueOn: firstOfNextMonth(today),
  });
  if (!created.ok) return { monthlyMinor, recurringId: null, projectId: project.id, projectTitle: project.title, synced: false };
  await deps.health.upsertSettings({ groceryRecurringId: created.value.id });
  return { monthlyMinor, recurringId: created.value.id, projectId: project.id, projectTitle: project.title, synced: true };
}
