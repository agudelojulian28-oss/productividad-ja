import { ok, err, type Result, type ActorContext } from '@/core/types';
import { AreaCreate } from './schemas';
import type { StructureRepo, AreaRow } from './ports';

export async function listAreas(
  _ctx: ActorContext,
  repo: StructureRepo,
): Promise<Result<AreaRow[]>> {
  return ok(await repo.listAreas());
}

export async function createArea(
  _ctx: ActorContext,
  repo: StructureRepo,
  raw: unknown,
): Promise<Result<AreaRow>> {
  const parsed = AreaCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  try {
    const row = await repo.insertArea(parsed.data);
    return ok(row);
  } catch (e) {
    if (e instanceof Error && e.message === 'DUPLICATE')
      return err('CONFLICT', 'Ya existe un área con ese nombre');
    throw e;
  }
}

export async function archiveArea(
  _ctx: ActorContext,
  repo: StructureRepo,
  id: string,
): Promise<Result<AreaRow>> {
  const area = await repo.getArea(id);
  if (!area) return err('NOT_FOUND', 'El área no existe');
  const row = await repo.updateArea(id, { archivedAt: new Date().toISOString() });
  return ok(row);
}
