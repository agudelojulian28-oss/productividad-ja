import { ok, err, type Result, type ActorContext } from '@/core/types';
import { GoalCreate } from './schemas';
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

  const row = await repo.insertGoal({
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    tz: ctx.tz,
  });
  return ok(row);
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
