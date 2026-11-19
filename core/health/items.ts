import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { HealthItemRow, HealthRepo } from './ports';

// Casos de uso del plan de salud: validar → autorizar (RLS + existencia) → reglas →
// ejecutar → Result. Un solo usuario.

export const SECTIONS = ['entrenamiento', 'dieta', 'cuerpo', 'espiritual'] as const;
export const KINDS = ['rutina', 'ejercicio', 'comida', 'salvavidas', 'tratamiento', 'compromiso', 'habito'] as const;

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const Weekdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((a) => new Set(a).size === a.length, 'Días repetidos');

const ItemCreate = z.object({
  section: z.enum(SECTIONS),
  kind: z.enum(KINDS),
  parentId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  detail: z.string().trim().max(2000).nullable().optional(),
  timeOfDay: Hhmm.nullable().optional(),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  weekdays: Weekdays.nullable().optional(),
  trackable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const ItemUpdate = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  detail: z.string().trim().max(2000).nullable().optional(),
  timeOfDay: Hhmm.nullable().optional(),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  weekdays: Weekdays.nullable().optional(),
  trackable: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

const Checkin = z.object({ itemId: z.uuid(), day: Ymd, done: z.boolean() });

/** Crea un elemento del plan. Reglas: un ejercicio cuelga de una rutina; un hijo vive en
 *  la misma sección que su padre. */
export async function createHealthItem(
  _ctx: ActorContext,
  repo: HealthRepo,
  raw: unknown,
): Promise<Result<HealthItemRow>> {
  const parsed = ItemCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;

  if (d.parentId) {
    const parent = await repo.getItem(d.parentId);
    if (!parent) return err('NOT_FOUND', 'El elemento padre no existe');
    if (parent.section !== d.section) return err('RULE_VIOLATION', 'El padre es de otra sección');
    if (d.kind === 'ejercicio' && parent.kind !== 'rutina') {
      return err('RULE_VIOLATION', 'Un ejercicio debe ir dentro de una rutina');
    }
  } else if (d.kind === 'ejercicio') {
    return err('RULE_VIOLATION', 'Un ejercicio debe ir dentro de una rutina');
  }

  const row = await repo.insertItem({
    section: d.section,
    kind: d.kind,
    parentId: d.parentId ?? null,
    title: d.title,
    detail: d.detail ?? null,
    timeOfDay: d.timeOfDay ?? null,
    durationMin: d.durationMin ?? null,
    weekdays: d.weekdays ?? null,
    trackable: d.trackable ?? false,
    sortOrder: d.sortOrder ?? 0,
  });
  return ok(row);
}

export async function updateHealthItem(
  _ctx: ActorContext,
  repo: HealthRepo,
  raw: unknown,
): Promise<Result<HealthItemRow>> {
  const parsed = ItemUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getItem(id);
  if (!cur) return err('NOT_FOUND', 'Ese elemento no existe');
  return ok(await repo.updateItem(id, patch));
}

/** Borra un elemento (y sus hijos y check-ins, por cascada). */
export async function deleteHealthItem(
  _ctx: ActorContext,
  repo: HealthRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  if (!z.uuid().safeParse(id).success) return err('INVALID_INPUT', 'ID inválido');
  const cur = await repo.getItem(id);
  if (!cur) return err('NOT_FOUND', 'Ese elemento no existe');
  await repo.deleteItem(id);
  return ok({ id });
}

/** Marca o desmarca un elemento con seguimiento en un día. Idempotente. */
export async function setHealthCheckin(
  _ctx: ActorContext,
  repo: HealthRepo,
  raw: unknown,
): Promise<Result<{ itemId: string; day: string; done: boolean }>> {
  const parsed = Checkin.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;
  const item = await repo.getItem(d.itemId);
  if (!item) return err('NOT_FOUND', 'Ese elemento no existe');
  if (!item.trackable) return err('RULE_VIOLATION', 'Ese elemento no tiene seguimiento diario');
  await repo.setCheckin(d.itemId, d.day, d.done);
  return ok(d);
}
