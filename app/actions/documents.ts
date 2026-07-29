'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import {
  createDocument,
  updateDocument,
  deleteDocument,
} from '@/core/structure/documents';
import type { Result } from '@/core/types';
import type { DocumentRow, DocumentKind } from '@/core/structure/ports';

async function deps() {
  const { supabase, ctx } = await requireContext();
  return { ctx, repo: structureRepo(supabase, ctx.userId) };
}

export async function createDocumentAction(input: {
  title: string;
  content?: string;
  kind: DocumentKind;
  areaId?: string;
  projectId?: string;
}): Promise<Result<DocumentRow>> {
  const { ctx, repo } = await deps();
  const result = await createDocument(ctx, repo, input, 'user');
  revalidatePath('/docs');
  if (input.projectId) revalidatePath(`/proyectos/${input.projectId}`);
  return result;
}

export async function updateDocumentAction(
  id: string,
  patch: { title?: string; content?: string; pinned?: boolean },
): Promise<Result<DocumentRow>> {
  const { ctx, repo } = await deps();
  const result = await updateDocument(ctx, repo, id, patch);
  revalidatePath('/docs');
  revalidatePath(`/docs/${id}`);
  return result;
}

export async function deleteDocumentAction(id: string): Promise<Result<{ id: string }>> {
  const { ctx, repo } = await deps();
  const result = await deleteDocument(ctx, repo, id);
  revalidatePath('/docs');
  return result;
}
