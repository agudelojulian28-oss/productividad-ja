import { ok, err, type Result, type ActorContext } from '@/core/types';
import { ProjectCreate } from '@/core/structure/schemas';
import type { WorkRepo, ProjectRow } from './ports';

export async function listProjects(
  _ctx: ActorContext,
  repo: WorkRepo,
  areaId?: string,
): Promise<Result<ProjectRow[]>> {
  return ok(await repo.listProjects(areaId));
}

export async function createProject(
  _ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<ProjectRow>> {
  const parsed = ProjectCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const row = await repo.insertProject(parsed.data);
  return ok(row);
}

export async function setProjectDescription(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
  description: string | null,
): Promise<Result<ProjectRow>> {
  const desc = (description ?? '').trim();
  if (desc.length > 5000) return err('INVALID_INPUT', 'La descripción es demasiado larga');
  const project = await repo.getProject(id);
  if (!project) return err('NOT_FOUND', 'El proyecto no existe');
  return ok(await repo.updateProject(id, { description: desc || null }));
}
