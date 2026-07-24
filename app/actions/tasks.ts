'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import {
  createTask,
  completeTask,
  reopenTask,
  rescheduleTask,
} from '@/core/work/tasks';
import type { Result } from '@/core/types';
import type { TaskRow } from '@/core/work/ports';

async function repo() {
  const { supabase, ctx } = await requireContext();
  return { ctx, repo: workRepo(supabase, ctx.userId) };
}

export async function createTaskAction(input: {
  title: string;
  dueAt?: string;
  projectId?: string;
}): Promise<Result<TaskRow>> {
  const { ctx, repo: r } = await repo();
  const result = await createTask(ctx, r, input);
  revalidatePath('/hoy');
  return result;
}

export async function completeTaskAction(id: string): Promise<Result<TaskRow>> {
  const { ctx, repo: r } = await repo();
  const result = await completeTask(ctx, r, id);
  revalidatePath('/hoy');
  return result;
}

export async function reopenTaskAction(id: string): Promise<Result<TaskRow>> {
  const { ctx, repo: r } = await repo();
  const result = await reopenTask(ctx, r, id);
  revalidatePath('/hoy');
  return result;
}

export async function rescheduleTaskAction(
  id: string,
  dueAt: string,
): Promise<Result<TaskRow>> {
  const { ctx, repo: r } = await repo();
  const result = await rescheduleTask(ctx, r, { id, dueAt });
  revalidatePath('/hoy');
  return result;
}
