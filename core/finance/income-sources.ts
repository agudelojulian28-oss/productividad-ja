import { ok, err, type Result, type ActorContext } from '@/core/types';
import { IncomeSourceCreate } from './schemas';
import type { FinanceRepo, IncomeSourceRow } from './ports';

// Casos de uso: validar → autorizar → reglas → ejecutar → Result<T>.
// La propiedad del área la garantiza RLS (el repo usa la sesión del usuario).

export async function createIncomeSource(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<IncomeSourceRow>> {
  const parsed = IncomeSourceCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const row = await repo.insertIncomeSource(parsed.data);
  return ok(row);
}

export async function listIncomeSources(
  _ctx: ActorContext,
  repo: FinanceRepo,
  areaId?: string,
): Promise<Result<IncomeSourceRow[]>> {
  return ok(await repo.listIncomeSources(areaId));
}

export async function archiveIncomeSource(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const src = await repo.getIncomeSource(id);
  if (!src) return err('NOT_FOUND', 'La fuente de ingreso no existe');
  await repo.archiveIncomeSource(id);
  return ok({ id });
}
