import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import { MoneyGoalCreate, MoneyGoalUpdate } from './schemas';
import type { FinanceRepo, MoneyGoalProgressRow } from './ports';

// Metas de dinero: validar → autorizar (RLS) → reglas (área/fuente, periodo) → ejecutar.
// El progreso lo calcula la vista goal_progress; aquí no se suma dinero.

export async function createMoneyGoal(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = MoneyGoalCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;

  // Si la meta se acota a una fuente, debe existir (RLS ya limita al usuario).
  if (d.incomeSourceId) {
    const src = await repo.getIncomeSource(d.incomeSourceId);
    if (!src) return err('NOT_FOUND', 'La fuente de ingreso no existe');
    if (d.areaId && src.areaId !== d.areaId) {
      return err('RULE_VIOLATION', 'La fuente no pertenece a esa área');
    }
  }

  return ok(await repo.insertMoneyGoal(d));
}

export async function listMoneyGoals(
  _ctx: ActorContext,
  repo: FinanceRepo,
): Promise<Result<MoneyGoalProgressRow[]>> {
  return ok(await repo.moneyGoalsProgress());
}

export async function updateMoneyGoal(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = MoneyGoalUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getMoneyGoal(id);
  if (!cur) return err('NOT_FOUND', 'Esa meta no existe');
  // El inicio no puede quedar después del cumplimiento (combina lo actual con el cambio).
  const start = patch.periodStart ?? cur.periodStart;
  const end = patch.periodEnd ?? cur.periodEnd;
  if (start > end) return err('RULE_VIOLATION', 'El inicio no puede ser posterior al cumplimiento');
  await repo.updateMoneyGoal(id, patch);
  return ok({ id });
}

export async function deleteMoneyGoal(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  if (!z.uuid().safeParse(id).success) return err('INVALID_INPUT', 'ID inválido');
  const cur = await repo.getMoneyGoal(id);
  if (!cur) return err('NOT_FOUND', 'Esa meta no existe');
  await repo.deleteMoneyGoal(id);
  return ok({ id });
}
