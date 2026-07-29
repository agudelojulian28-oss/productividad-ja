import { ok, err, type Result, type ActorContext } from '@/core/types';
import { MoneyGoalCreate } from './schemas';
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
