import { ok, err, type Result, type ActorContext } from '@/core/types';
import { TaskCreate, TaskReschedule } from './schemas';
import type { WorkRepo, TaskRow } from './ports';

// Casos de uso: validar → autorizar → reglas → ejecutar → devolver Result<T>.
// La autorización de propiedad la garantiza RLS (el repo usa la sesión del usuario).

export async function createTask(
  ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<TaskRow>> {
  const parsed = TaskCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);

  const { title, notes, projectId, dueAt } = parsed.data;
  const row = await repo.insertTask({
    title,
    notes,
    projectId,
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
