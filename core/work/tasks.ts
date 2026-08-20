import { ok, err, type Result, type ActorContext } from '@/core/types';
import { TaskCreate, TaskReschedule, TaskEdit } from './schemas';
import type { WorkRepo, TaskRow, TaskPatch } from './ports';

// Casos de uso: validar → autorizar → reglas → ejecutar → devolver Result<T>.
// La autorización de propiedad la garantiza RLS (el repo usa la sesión del usuario).

export async function createTask(
  ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<TaskRow>> {
  const parsed = TaskCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);

  const { title, notes, projectId, goalId, dueAt } = parsed.data;

  // Si viene meta: debe existir; y si también viene proyecto, deben coincidir.
  // El proyecto se deriva de la meta cuando no se especifica.
  let finalProjectId = projectId;
  if (goalId) {
    const goal = await repo.getGoal(goalId);
    if (!goal) return err('NOT_FOUND', 'La meta no existe');
    if (projectId && goal.projectId && goal.projectId !== projectId) {
      return err('RULE_VIOLATION', 'La meta no pertenece a ese proyecto');
    }
    finalProjectId = projectId ?? goal.projectId ?? undefined;
  }

  const row = await repo.insertTask({
    title,
    notes,
    projectId: finalProjectId,
    goalId,
    dueAt,
    origin: ctx.actor === 'user' ? 'manual' : 'agente',
  });
  return ok(row);
}

export async function completeTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
): Promise<Result<TaskRow>> {
  const task = await repo.getTask(id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');
  if (task.status === 'done') return ok(task); // idempotente
  const row = await repo.updateTask(id, {
    status: 'done',
    completedAt: new Date().toISOString(),
  });
  return ok(row);
}

export async function reopenTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
): Promise<Result<TaskRow>> {
  const task = await repo.getTask(id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');
  const row = await repo.updateTask(id, { status: 'pending', completedAt: null });
  return ok(row);
}

export async function deleteTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const task = await repo.getTask(id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');
  await repo.deleteTask(id);
  return ok({ id });
}

export async function setTaskDescription(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
  description: string | null,
): Promise<Result<TaskRow>> {
  const desc = (description ?? '').trim();
  if (desc.length > 5000) return err('INVALID_INPUT', 'La descripción es demasiado larga');
  const task = await repo.getTask(id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');
  return ok(await repo.updateTask(id, { notes: desc || null }));
}

/** Edición completa: título, notas, fecha, proyecto y meta (con coherencia proyecto↔meta). */
export async function editTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<TaskRow>> {
  const parsed = TaskEdit.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, title, notes, projectId, goalId, dueAt } = parsed.data;

  const task = await repo.getTask(id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');

  const patch: TaskPatch = {};
  if (title !== undefined) patch.title = title;
  if (notes !== undefined) patch.notes = notes; // null limpia
  if (dueAt !== undefined) patch.dueAt = dueAt; // null limpia la fecha

  if (goalId !== undefined && goalId !== null) {
    // Meta nueva: debe existir; el proyecto se deriva de la meta si no coincide/no viene.
    const goal = await repo.getGoal(goalId);
    if (!goal) return err('NOT_FOUND', 'La meta no existe');
    if (projectId != null && goal.projectId && goal.projectId !== projectId) {
      return err('RULE_VIOLATION', 'La meta no pertenece a ese proyecto');
    }
    patch.goalId = goalId;
    patch.projectId = projectId !== undefined ? projectId : (goal.projectId ?? null);
  } else {
    // Sin meta nueva (o se limpia). Aplica el cambio de proyecto si viene.
    if (goalId === null) patch.goalId = null;
    if (projectId !== undefined) {
      patch.projectId = projectId;
      // Si la meta actual ya no pertenece al nuevo proyecto, límpiala.
      if (goalId === undefined && task.goalId) {
        const cur = await repo.getGoal(task.goalId);
        if (cur && cur.projectId && cur.projectId !== projectId) patch.goalId = null;
      }
    }
  }

  if (Object.keys(patch).length === 0) return ok(task);
  return ok(await repo.updateTask(id, patch));
}

export async function rescheduleTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<TaskRow>> {
  const parsed = TaskReschedule.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const task = await repo.getTask(parsed.data.id);
  if (!task) return err('NOT_FOUND', 'La tarea no existe');
  const row = await repo.updateTask(parsed.data.id, { dueAt: parsed.data.dueAt });
  return ok(row);
}
