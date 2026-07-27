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
} from '@/core/work/tasks';
import { syncTaskToCalendar, removeTaskEvent } from '@/lib/calendar-sync';
import type { Result } from '@/core/types';
import type { TaskRow } from '@/core/work/ports';

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
  const { supabase, ctx, repo } = await deps();
  const result = await createTask(ctx, repo, input);
  if (result.ok) await syncTaskToCalendar(supabase, ctx, repo, result.value);
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
  const { supabase, ctx, repo } = await deps();
  const task = await repo.getTask(id);
  const result = await deleteTask(ctx, repo, id);
  if (result.ok && task?.googleEventId) {
    await removeTaskEvent(supabase, ctx, task.googleEventId);
  }
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
  const { supabase, ctx, repo } = await deps();
  const result = await rescheduleTask(ctx, repo, { id, dueAt });
  if (result.ok) await syncTaskToCalendar(supabase, ctx, repo, result.value);
  revalidatePath('/hoy');
  return result;
}
