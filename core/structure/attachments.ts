import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { StructureRepo, AttachmentRow } from './ports';

// Adjuntos (imágenes). Al ingresar una imagen se registra saved=false; el agente
// la marca saved=true (y la enlaza a un proyecto) solo cuando el usuario lo pide.
// La subida al bucket es un efecto de adapter; aquí solo se guarda el metadato.

export const AttachmentSave = z.object({
  id: z.uuid(),
  projectId: z.uuid().optional(),
  transactionId: z.uuid().optional(),
  description: z.string().trim().max(500).optional(),
});

export async function registerAttachment(
  _ctx: ActorContext,
  repo: StructureRepo,
  input: {
    storagePath: string;
    mime: string;
    transactionId?: string;
    projectId?: string;
    description?: string;
    saved?: boolean;
  },
): Promise<Result<AttachmentRow>> {
  if (!input.storagePath) return err('INVALID_INPUT', 'Falta la ruta de la imagen');
  return ok(await repo.insertAttachment(input));
}

export async function listAttachmentsByTransaction(
  _ctx: ActorContext,
  repo: StructureRepo,
  transactionId: string,
): Promise<Result<AttachmentRow[]>> {
  return ok(await repo.listAttachmentsByTransaction(transactionId));
}

export async function saveAttachment(
  _ctx: ActorContext,
  repo: StructureRepo,
  raw: unknown,
): Promise<Result<AttachmentRow>> {
  const parsed = AttachmentSave.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const att = await repo.getAttachment(parsed.data.id);
  if (!att) return err('NOT_FOUND', 'No encuentro esa imagen (adjunto_id inválido)');
  // Si se enlaza a un proyecto, debe existir (RLS ya limita al usuario).
  return ok(
    await repo.updateAttachment(parsed.data.id, {
      saved: true,
      projectId: parsed.data.projectId ?? null,
      transactionId: parsed.data.transactionId ?? null,
      description: parsed.data.description ?? null,
    }),
  );
}

export async function listSavedAttachments(
  _ctx: ActorContext,
  repo: StructureRepo,
  projectId: string,
): Promise<Result<AttachmentRow[]>> {
  return ok(await repo.listSavedAttachments(projectId));
}
