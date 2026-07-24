'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { createArea, archiveArea } from '@/core/structure/areas';
import type { Result } from '@/core/types';
import type { AreaRow } from '@/core/structure/ports';

async function ctxRepo() {
  const { supabase, ctx } = await requireContext();
  return { ctx, repo: structureRepo(supabase, ctx.userId) };
}

export async function createAreaAction(input: {
  name: string;
  kind: 'negocio' | 'personal';
}): Promise<Result<AreaRow>> {
  const { ctx, repo } = await ctxRepo();
  const res = await createArea(ctx, repo, input);
  revalidatePath('/areas');
  return res;
}

export async function archiveAreaAction(id: string): Promise<Result<AreaRow>> {
  const { ctx, repo } = await ctxRepo();
  const res = await archiveArea(ctx, repo, id);
  revalidatePath('/areas');
  return res;
}
