'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { createProject } from '@/core/work/projects';
import type { Result } from '@/core/types';
import type { ProjectRow } from '@/core/work/ports';

export async function createProjectAction(input: {
  title: string;
  areaId: string;
}): Promise<Result<ProjectRow>> {
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const res = await createProject(ctx, repo, input);
  revalidatePath(`/areas/${input.areaId}`);
  return res;
}
