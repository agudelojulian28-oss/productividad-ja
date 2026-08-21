'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import {
  createTask,
  completeTask,
  reopenTask,
  rescheduleTask,
  deleteTask,
  setTaskDescription,
  editTask,
} from '@/core/work/tasks';
import {
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  generateDueRecurringTasks,
} from '@/core/work/recurring-tasks';
import { todayInTz } from '@/lib/format';
import type { Result } from '@/core/types';
import type { TaskRow, RecurringTaskRow } from '@/core/work/ports';

// Las TAREAS viven solo en la app: no se sincronizan a Google Calendar (los
// EVENTOS son los que van al calendario). Ver ADR-022.
async function deps() {
  const { supabase, ctx } = await requireContext();
  return { supabase, ctx, repo: workRepo(supabase, ctx.userId) };
}

export async function createTaskAction(input: {
  title: string;
  dueAt?: string;
  projectId?: string;
  goalId?: string;
}): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await createTask(ctx, repo, input);
  revalidatePath('/hoy');
  return result;
}

export async function completeTaskAction(id: string): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await completeTask(ctx, repo, id);
  revalidatePath('/hoy');
  return result;
}

export async function reopenTaskAction(id: string): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await reopenTask(ctx, repo, id);
  revalidatePath('/hoy');
  return result;
}

export async function deleteTaskAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteTask(ctx, repo, id);
  revalidatePath('/hoy');
  return result;
}

export async function setTaskDescriptionAction(
  id: string,
  description: string,
): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await setTaskDescription(ctx, repo, id, description);
  revalidatePath(`/tareas/${id}`);
  return result;
}

export async function rescheduleTaskAction(
  id: string,
  dueAt: string,
): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await rescheduleTask(ctx, repo, { id, dueAt });
  revalidatePath('/hoy');
  return result;
}

export async function updateTaskAction(input: {
  id: string;
  title?: string;
  notes?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  dueAt?: string | null;
}): Promise<Result<TaskRow>> {
  const { ctx, repo } = await deps();
  const result = await editTask(ctx, repo, input);
  revalidatePath('/hoy');
  revalidatePath(`/tareas/${input.id}`);
  return result;
}

// ── Tareas recurrentes ─────────────────────────────────────────────────────────
export async function createRecurringTaskAction(input: {
  title: string;
  notes?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  frequency: string;
  dueTime?: string | null;
  nextDueOn: string;
}): Promise<Result<RecurringTaskRow>> {
  const { ctx, repo } = await deps();
  const result = await createRecurringTask(ctx, repo, input);
  revalidatePath('/tareas/recurrentes');
  revalidatePath('/hoy');
  return result;
}

export async function updateRecurringTaskAction(input: {
  id: string;
  title?: string;
  notes?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  frequency?: string;
  dueTime?: string | null;
  nextDueOn?: string;
  active?: boolean;
}): Promise<Result<RecurringTaskRow>> {
  const { ctx, repo } = await deps();
  const result = await updateRecurringTask(ctx, repo, input);
  revalidatePath('/tareas/recurrentes');
  return result;
}

export async function deleteRecurringTaskAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteRecurringTask(ctx, repo, id);
  revalidatePath('/tareas/recurrentes');
  return result;
}

/** Materializa las recurrentes vencidas (aparecen solas en Hoy). Devuelve cuántas creó. */
export async function generateDueRecurringTasksAction(): Promise<number> {
  const { ctx, repo } = await deps();
  const result = await generateDueRecurringTasks(ctx, repo, todayInTz(ctx.tz));
  if (result.ok && result.value.created > 0) revalidatePath('/hoy');
  return result.ok ? result.value.created : 0;
}
