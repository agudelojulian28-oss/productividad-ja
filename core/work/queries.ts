import { ok, type Result, type ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from './ports';

function dateInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
}

/** agenda_hoy = pendientes con fecha de hoy (zona del usuario); pendientes = todos. */
export async function consultar(
  ctx: ActorContext,
  repo: WorkRepo,
  vista: 'agenda_hoy' | 'pendientes',
): Promise<Result<TaskRow[]>> {
  const pendientes = await repo.listTasks({ status: 'pending' });
  if (vista === 'pendientes') return ok(pendientes);

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }).format(new Date());
  return ok(pendientes.filter((t) => t.dueAt && dateInTz(t.dueAt, ctx.tz) === hoy));
}

export async function buscar(
  _ctx: ActorContext,
  repo: WorkRepo,
  texto: string,
): Promise<Result<TaskRow[]>> {
  return ok(await repo.searchTasks(texto));
}
