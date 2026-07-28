'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { createGoal, setGoalDescription, updateGoal } from '@/core/work/goals';
import type { Result } from '@/core/types';
import type { GoalRow } from '@/core/work/ports';

export async function createGoalAction(input: {
  projectId: string;
  title: string;
  targetValue?: number;
  deadline?: string;
}): Promise<Result<GoalRow>> {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const result = await createGoal(ctx, repo, input);
  revalidatePath(`/proyectos/${input.projectId}`);
  return result;
}

export async function updateGoalAction(
  id: string,
  input: { targetValue?: number; deadline?: string },
): Promise<Result<GoalRow>> {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const res = await updateGoal(ctx, repo, id, input);
  revalidatePath(`/metas/${id}`);
  return res;
}

export async function setGoalDescriptionAction(
  id: string,
  description: string,
): Promise<Result<GoalRow>> {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const res = await setGoalDescription(ctx, repo, id, description);
  revalidatePath(`/metas/${id}`);
  return res;
}
