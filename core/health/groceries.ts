import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { GroceryRow, HealthRepo } from './ports';

// Lista de mercado. Su total mensual-equivalente se sincroniza como UN gasto fijo en
// Finanzas; esa orquestación vive fuera del core (lib/salud-mercado.ts) para que salud
// no dependa de finanzas.

export const GROCERY_FREQ = ['semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'] as const;
const Cost = z.number().int().min(0).max(1_000_000_000_000);

const GroceryCreate = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  quantity: z.string().trim().max(60).nullable().optional(),
  costMinor: Cost.optional(),
  frequency: z.enum(GROCERY_FREQ).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const GroceryUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.string().trim().max(60).nullable().optional(),
  costMinor: Cost.optional(),
  frequency: z.enum(GROCERY_FREQ).optional(),
  checked: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function createGrocery(
  _ctx: ActorContext,
  repo: HealthRepo,
  raw: unknown,
): Promise<Result<GroceryRow>> {
  const parsed = GroceryCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;
  return ok(
    await repo.insertGrocery({
      name: d.name,
      quantity: d.quantity ?? null,
      costMinor: d.costMinor ?? 0,
      frequency: d.frequency ?? 'semanal',
      sortOrder: d.sortOrder ?? 0,
    }),
  );
}

export async function updateGrocery(
  _ctx: ActorContext,
  repo: HealthRepo,
  raw: unknown,
): Promise<Result<GroceryRow>> {
  const parsed = GroceryUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getGrocery(id);
  if (!cur) return err('NOT_FOUND', 'Ese ítem no existe');
  return ok(await repo.updateGrocery(id, patch));
}

export async function deleteGrocery(
  _ctx: ActorContext,
  repo: HealthRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  if (!z.uuid().safeParse(id).success) return err('INVALID_INPUT', 'ID inválido');
  const cur = await repo.getGrocery(id);
  if (!cur) return err('NOT_FOUND', 'Ese ítem no existe');
  await repo.deleteGrocery(id);
  return ok({ id });
}
