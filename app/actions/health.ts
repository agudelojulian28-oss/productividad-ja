'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { todayInTz } from '@/lib/format';
import { healthRepo } from '@/adapters/supabase/health-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { createHealthItem, updateHealthItem, deleteHealthItem, setHealthCheckin } from '@/core/health/items';
import { createGrocery, updateGrocery, deleteGrocery } from '@/core/health/groceries';
import { seedHealthPlan } from '@/core/health/seed';
import { addDaysYmd, groceryMonthlyMinor } from '@/core/health/plan';
import { syncMercado, type MercadoSync } from '@/lib/salud-mercado';
import { ok, err, type Result } from '@/core/types';
import type { CheckinRow, GroceryRow, HealthItemRow } from '@/core/health/ports';

async function deps() {
  const { supabase, ctx } = await requireContext();
  return {
    ctx,
    today: todayInTz(ctx.tz),
    health: healthRepo(supabase, ctx.userId),
    finance: financeRepo(supabase, ctx.userId),
    work: workRepo(supabase, ctx.userId),
    structure: structureRepo(supabase, ctx.userId),
  };
}

function refresh() {
  revalidatePath('/salud', 'layout');
  revalidatePath('/hoy');
}

export interface SaludData {
  today: string;
  items: HealthItemRow[];
  checkins: CheckinRow[]; // últimos ~120 días (racha) — incluye hoy
  groceries: GroceryRow[];
  mercado: MercadoSync;
  projects: { id: string; title: string }[];
}

/** Todo lo del módulo en una lectura. La primera vez precarga el plan de Julián. */
export async function getSaludData(): Promise<SaludData> {
  const d = await deps();
  await seedHealthPlan(d.ctx, d.health);
  const [items, checkins, groceries, settings, projects] = await Promise.all([
    d.health.listItems(),
    d.health.listCheckins(addDaysYmd(d.today, -120), d.today),
    d.health.listGroceries(),
    d.health.getSettings(),
    d.work.listProjects(),
  ]);
  // Estado del vínculo con Finanzas (solo lectura: sincronizar escribe, leer no).
  const monthlyMinor = groceryMonthlyMinor(groceries);
  const rec = settings?.groceryRecurringId ? await d.finance.getRecurringExpense(settings.groceryRecurringId) : null;
  const project = settings?.groceryProjectId ? projects.find((p) => p.id === settings.groceryProjectId) : undefined;
  return {
    today: d.today,
    items,
    checkins,
    groceries,
    mercado: {
      monthlyMinor,
      recurringId: rec?.id ?? null,
      projectId: project?.id ?? null,
      projectTitle: project?.title ?? null,
      synced: Boolean(rec?.active && rec.amountMinor === monthlyMinor && monthlyMinor > 0),
    },
    projects: projects.filter((p) => p.areaId).map((p) => ({ id: p.id, title: p.title })),
  };
}

// ── Plan ─────────────────────────────────────────────────────────────────────
export async function createHealthItemAction(input: unknown): Promise<Result<HealthItemRow>> {
  const d = await deps();
  const r = await createHealthItem(d.ctx, d.health, input);
  refresh();
  return r;
}
export async function updateHealthItemAction(input: unknown): Promise<Result<HealthItemRow>> {
  const d = await deps();
  const r = await updateHealthItem(d.ctx, d.health, input);
  refresh();
  return r;
}
export async function deleteHealthItemAction(id: string): Promise<Result<{ id: string }>> {
  const d = await deps();
  const r = await deleteHealthItem(d.ctx, d.health, id);
  refresh();
  return r;
}
export async function setCheckinAction(input: { itemId: string; day: string; done: boolean }) {
  const d = await deps();
  const r = await setHealthCheckin(d.ctx, d.health, input);
  refresh();
  return r;
}

// ── Mercado (cada cambio de costo re-sincroniza el gasto fijo en Finanzas) ─────────
async function resync(d: Awaited<ReturnType<typeof deps>>): Promise<MercadoSync> {
  const s = await syncMercado(d.ctx, d, d.today);
  revalidatePath('/finanzas');
  return s;
}

export async function createGroceryAction(input: unknown): Promise<Result<{ sync: MercadoSync }>> {
  const d = await deps();
  const r = await createGrocery(d.ctx, d.health, input);
  if (!r.ok) return r;
  const sync = await resync(d);
  refresh();
  return ok({ sync });
}
export async function updateGroceryAction(
  input: { id: string } & Record<string, unknown>,
): Promise<Result<{ sync: MercadoSync | null }>> {
  const d = await deps();
  const r = await updateGrocery(d.ctx, d.health, input);
  if (!r.ok) return r;
  // Marcar "comprado" no cambia el costo: no hace falta tocar Finanzas.
  const soloCheck = Object.keys(input).every((k) => k === 'id' || k === 'checked');
  const sync = soloCheck ? null : await resync(d);
  refresh();
  return ok({ sync });
}
export async function deleteGroceryAction(id: string): Promise<Result<{ sync: MercadoSync }>> {
  const d = await deps();
  const r = await deleteGrocery(d.ctx, d.health, id);
  if (!r.ok) return r;
  const sync = await resync(d);
  refresh();
  return ok({ sync });
}
export async function resetGroceriesAction(): Promise<Result<{ ok: true }>> {
  const d = await deps();
  await d.health.resetGroceriesChecked();
  refresh();
  return ok({ ok: true });
}
export async function setMercadoProjectAction(projectId: string): Promise<Result<{ sync: MercadoSync }>> {
  const d = await deps();
  const p = await d.work.getProject(projectId);
  if (!p) return err('NOT_FOUND', 'Ese proyecto no existe');
  if (!p.areaId) return err('RULE_VIOLATION', 'Ese proyecto no tiene área');
  await d.health.upsertSettings({ groceryProjectId: p.id });
  const sync = await resync(d);
  refresh();
  return ok({ sync });
}
export async function syncMercadoAction(): Promise<Result<{ sync: MercadoSync }>> {
  const d = await deps();
  const sync = await resync(d);
  refresh();
  return ok({ sync });
}
