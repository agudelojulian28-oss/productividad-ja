import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { FinanceRepo, TagRow } from './ports';

// Etiquetas POR PROYECTO (ADR-029): clasifican movimientos y recurrentes de su proyecto.
// Casos de uso: validar → autorizar → reglas → ejecutar. La propiedad la garantiza RLS
// (el repo usa la sesión del usuario).

const TagName = z.string().trim().min(1, 'La etiqueta no puede ir vacía').max(40);
// Color opcional: hex #rgb/#rrggbb o null para limpiarlo.
const TagColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color inválido (usa hex, p. ej. #f97316)')
  .nullable();

const TagCreate = z.object({
  name: TagName,
  color: TagColor.optional(),
  projectId: z.uuid(),
});

export async function createTag(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<TagRow>> {
  const parsed = TagCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  // Nombre único DENTRO del proyecto (case-insensitive): lo garantiza el índice; error claro.
  const existing = await repo.listTags(parsed.data.projectId);
  const name = parsed.data.name;
  if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return err('RULE_VIOLATION', `Ya existe una etiqueta llamada "${name}" en ese proyecto`);
  }
  return ok(
    await repo.insertTag({ name, color: parsed.data.color ?? null, projectId: parsed.data.projectId }),
  );
}

const TagUpdate = z.object({
  id: z.uuid(),
  name: TagName.optional(),
  color: TagColor.optional(),
});

export async function updateTag(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<TagRow>> {
  const parsed = TagUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getTag(id);
  if (!cur) return err('NOT_FOUND', 'Esa etiqueta no existe');
  if (patch.name !== undefined) {
    // Unicidad dentro del proyecto de la etiqueta.
    const others = await repo.listTags(cur.projectId);
    const name = patch.name;
    if (others.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) {
      return err('RULE_VIOLATION', `Ya existe una etiqueta llamada "${name}" en ese proyecto`);
    }
  }
  return ok(await repo.updateTag(id, patch));
}

export async function listTags(
  _ctx: ActorContext,
  repo: FinanceRepo,
  projectId?: string,
): Promise<Result<TagRow[]>> {
  return ok(await repo.listTags(projectId));
}

export async function deleteTag(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const cur = await repo.getTag(id);
  if (!cur) return err('NOT_FOUND', 'Esa etiqueta no existe');
  // Los vínculos (transaction_tags / recurring_tags) caen por ON DELETE CASCADE.
  await repo.deleteTag(id);
  return ok({ id });
}

const SetTags = z.object({
  id: z.uuid(),
  tagIds: z.array(z.uuid()).max(20),
});

/** Reemplaza el conjunto de etiquetas de un movimiento. Cada etiqueta debe pertenecer
 *  al MISMO proyecto del movimiento (ADR-029). */
export async function setTransactionTags(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<{ id: string; tagIds: string[] }>> {
  const parsed = SetTags.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const tx = await repo.getTransaction(parsed.data.id);
  if (!tx) return err('NOT_FOUND', 'Ese movimiento no existe');
  const bad = await mismatchedTags(repo, tx.projectId, parsed.data.tagIds);
  if (bad) return bad;
  await repo.setTransactionTags(parsed.data.id, parsed.data.tagIds);
  return ok({ id: parsed.data.id, tagIds: parsed.data.tagIds });
}

/** Reemplaza el conjunto de etiquetas de una recurrente. Cada etiqueta debe pertenecer
 *  al MISMO proyecto de la recurrente (ADR-029). */
export async function setRecurringTags(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<{ id: string; tagIds: string[] }>> {
  const parsed = SetTags.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const rec = await repo.getRecurringExpense(parsed.data.id);
  if (!rec) return err('NOT_FOUND', 'Esa recurrente no existe');
  const bad = await mismatchedTags(repo, rec.projectId, parsed.data.tagIds);
  if (bad) return bad;
  await repo.setRecurringTags(parsed.data.id, parsed.data.tagIds);
  return ok({ id: parsed.data.id, tagIds: parsed.data.tagIds });
}

/** Devuelve un Err si alguna etiqueta no existe o pertenece a otro proyecto; null si todo bien. */
async function mismatchedTags(
  repo: FinanceRepo,
  projectId: string | null,
  tagIds: string[],
): Promise<import('@/core/types').Err | null> {
  if (tagIds.length === 0) return null;
  // Sin proyecto no hay etiquetas válidas (las etiquetas son por proyecto, ADR-029).
  const own = projectId ? new Set((await repo.listTags(projectId)).map((t) => t.id)) : new Set<string>();
  const bad = tagIds.filter((id) => !own.has(id));
  if (bad.length > 0) {
    return err(
      'RULE_VIOLATION',
      'Alguna etiqueta no existe o pertenece a otro proyecto; usa solo etiquetas del proyecto del movimiento',
    );
  }
  return null;
}
