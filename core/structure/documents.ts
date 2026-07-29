import { ok, err, type Result, type ActorContext } from '@/core/types';
import { DocumentCreate, DocumentUpdate, DocumentAppend } from './schemas';
import type { StructureRepo, DocumentRow, DocumentAuthor } from './ports';

// Documentación del método. Validar → autorizar (RLS por la sesión) → ejecutar → Result.
// El agente documenta de forma aditiva (crear/anexar); borrar es solo del usuario.

export async function createDocument(
  _ctx: ActorContext,
  repo: StructureRepo,
  raw: unknown,
  author: DocumentAuthor = 'user',
): Promise<Result<DocumentRow>> {
  const parsed = DocumentCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  return ok(await repo.insertDocument({ ...parsed.data, author }));
}

export async function updateDocument(
  _ctx: ActorContext,
  repo: StructureRepo,
  id: string,
  raw: unknown,
): Promise<Result<DocumentRow>> {
  const parsed = DocumentUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const doc = await repo.getDocument(id);
  if (!doc) return err('NOT_FOUND', 'El documento no existe');
  return ok(await repo.updateDocument(id, parsed.data));
}

export async function appendToDocument(
  _ctx: ActorContext,
  repo: StructureRepo,
  raw: unknown,
): Promise<Result<DocumentRow>> {
  const parsed = DocumentAppend.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const doc = await repo.getDocument(parsed.data.id);
  if (!doc) return err('NOT_FOUND', 'El documento no existe');
  const sep = doc.content.trim() ? '\n\n' : '';
  const content = doc.content + sep + parsed.data.content;
  return ok(await repo.updateDocument(doc.id, { content }));
}

export async function deleteDocument(
  _ctx: ActorContext,
  repo: StructureRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const doc = await repo.getDocument(id);
  if (!doc) return err('NOT_FOUND', 'El documento no existe');
  await repo.deleteDocument(id);
  return ok({ id });
}

export async function listDocuments(
  _ctx: ActorContext,
  repo: StructureRepo,
  filter?: { projectId?: string },
): Promise<Result<DocumentRow[]>> {
  return ok(await repo.listDocuments(filter));
}

export async function getDocument(
  _ctx: ActorContext,
  repo: StructureRepo,
  id: string,
): Promise<Result<DocumentRow>> {
  const doc = await repo.getDocument(id);
  if (!doc) return err('NOT_FOUND', 'El documento no existe');
  return ok(doc);
}
