import { ok, err, type Result, type ActorContext } from '@/core/types';
import { GoalCreate, GoalUpdate } from './schemas';
import type { WorkRepo, GoalRow } from './ports';

// Metas dentro de `work`: cuelgan de un proyecto (ADR-021). El progreso se calcula en la
// vista `goal_progress`; este módulo no importa finance/commerce.

export async function listGoals(
  _ctx: ActorContext,
  repo: WorkRepo,
  projectId: string,
): Promise<Result<GoalRow[]>> {
  return ok(await repo.listGoals(projectId));
}

export async function createGoal(
  ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<GoalRow>> {
  const parsed = GoalCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);

  // Autorizar: el proyecto debe existir y ser del usuario (RLS + verificación explícita).
  const project = await repo.getProject(parsed.data.projectId);
  if (!project) return err('NOT_FOUND', 'El proyecto no existe');

  if (parsed.data.startDate && parsed.data.deadline && parsed.data.startDate > parsed.data.deadline) {
    return err('RULE_VIOLATION', 'La fecha de inicio no puede ser posterior a la de cumplimiento');
  }
  const row = await repo.insertGoal({
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    tz: ctx.tz,
    targetValue: parsed.data.targetValue,
    startDate: parsed.data.startDate,
    deadline: parsed.data.deadline,
  });
  return ok(row);
}

export async function updateGoal(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
  raw: unknown,
): Promise<Result<GoalRow>> {
  const parsed = GoalUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const goal = await repo.getGoal(id);
  if (!goal) return err('NOT_FOUND', 'La meta no existe');

  // Validar orden contra el estado resultante (los que no cambian, se toman de la meta).
  const start = parsed.data.startDate ?? goal.periodStart;
  const end = parsed.data.deadline ?? goal.periodEnd;
  if (start > end) {
    return err('RULE_VIOLATION', 'La fecha de inicio no puede ser posterior a la de cumplimiento');
  }

  return ok(
    await repo.updateGoal(id, {
      targetValue: parsed.data.targetValue,
      periodStart: parsed.data.startDate,
      periodEnd: parsed.data.deadline,
    }),
  );
}

export async function setGoalDescription(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
  description: string | null,
): Promise<Result<GoalRow>> {
  const desc = (description ?? '').trim();
  if (desc.length > 5000) return err('INVALID_INPUT', 'La descripción es demasiado larga');
  const goal = await repo.getGoal(id);
  if (!goal) return err('NOT_FOUND', 'La meta no existe');
  return ok(await repo.updateGoal(id, { description: desc || null }));
}
