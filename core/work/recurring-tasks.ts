import { ok, err, type Result, type ActorContext } from '@/core/types';
import { RecurringTaskCreate, RecurringTaskUpdate } from './schemas';
import type { WorkRepo, RecurringTaskRow, RecurringTaskPatch, TaskFrequency } from './ports';

// Casos de uso: validar → autorizar → reglas → ejecutar → Result<T>. La propiedad la
// garantiza RLS. `nextDue` se copia de finance (work no puede importar de finance).

function addMonths(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

/** Próxima fecha de una recurrente, a partir de una fecha base (YYYY-MM-DD). */
export function nextDue(frequency: TaskFrequency, fromYmd: string): string {
  const d = new Date(`${fromYmd}T00:00:00Z`);
  switch (frequency) {
    case 'semanal':
      d.setUTCDate(d.getUTCDate() + 7);
      return toYmd(d);
    case 'quincenal':
      d.setUTCDate(d.getUTCDate() + 15);
      return toYmd(d);
    case 'mensual':
      return toYmd(addMonths(d, 1));
    case 'bimestral':
      return toYmd(addMonths(d, 2));
    case 'trimestral':
      return toYmd(addMonths(d, 3));
    case 'anual':
      return toYmd(addMonths(d, 12));
  }
}

/** Minutos de offset (este de UTC) de una zona en un instante dado. */
function offsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value;
    return a;
  }, {});
  const asUTC = Date.UTC(
    +(p.year ?? '1970'),
    +(p.month ?? '1') - 1,
    +(p.day ?? '1'),
    +(p.hour ?? '0'),
    +(p.minute ?? '0'),
    +(p.second ?? '0'),
  );
  return (asUTC - date.getTime()) / 60000;
}

/** ISO-8601 (con offset) para una hora de pared (ymd + HH:MM) en la zona del usuario. */
function instantFrom(ymd: string, hm: string, tz: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hm.split(':').map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
  const off = offsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000).toISOString();
}

/** Coherencia proyecto↔meta: si viene meta, existe y (si viene proyecto) coincide;
 *  el proyecto se deriva de la meta cuando no se especifica. */
async function resolveProjectGoal(
  repo: WorkRepo,
  projectId: string | null,
  goalId: string | null,
): Promise<Result<{ projectId: string | null; goalId: string | null }>> {
  if (goalId) {
    const goal = await repo.getGoal(goalId);
    if (!goal) return err('NOT_FOUND', 'La meta no existe');
    if (projectId && goal.projectId && goal.projectId !== projectId) {
      return err('RULE_VIOLATION', 'La meta no pertenece a ese proyecto');
    }
    return ok({ projectId: projectId ?? goal.projectId ?? null, goalId });
  }
  return ok({ projectId: projectId ?? null, goalId: null });
}

export async function createRecurringTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<RecurringTaskRow>> {
  const parsed = RecurringTaskCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { title, notes, projectId, goalId, frequency, dueTime, nextDueOn } = parsed.data;
  const r = await resolveProjectGoal(repo, projectId ?? null, goalId ?? null);
  if (!r.ok) return r;
  return ok(
    await repo.insertRecurringTask({
      title,
      notes: notes ?? null,
      projectId: r.value.projectId,
      goalId: r.value.goalId,
      frequency,
      dueTime: dueTime ?? null,
      nextDueOn,
    }),
  );
}

export async function updateRecurringTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  raw: unknown,
): Promise<Result<RecurringTaskRow>> {
  const parsed = RecurringTaskUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, title, notes, projectId, goalId, frequency, dueTime, nextDueOn, active } = parsed.data;
  const cur = await repo.getRecurringTask(id);
  if (!cur) return err('NOT_FOUND', 'Esa tarea recurrente no existe');

  const patch: RecurringTaskPatch = {};
  if (title !== undefined) patch.title = title;
  if (notes !== undefined) patch.notes = notes;
  if (frequency !== undefined) patch.frequency = frequency;
  if (dueTime !== undefined) patch.dueTime = dueTime;
  if (nextDueOn !== undefined) patch.nextDueOn = nextDueOn;
  if (active !== undefined) patch.active = active;

  if (goalId !== undefined && goalId !== null) {
    const goal = await repo.getGoal(goalId);
    if (!goal) return err('NOT_FOUND', 'La meta no existe');
    if (projectId != null && goal.projectId && goal.projectId !== projectId) {
      return err('RULE_VIOLATION', 'La meta no pertenece a ese proyecto');
    }
    patch.goalId = goalId;
    patch.projectId = projectId !== undefined ? projectId : (goal.projectId ?? null);
  } else {
    if (goalId === null) patch.goalId = null;
    if (projectId !== undefined) {
      patch.projectId = projectId;
      if (goalId === undefined && cur.goalId) {
        const g = await repo.getGoal(cur.goalId);
        if (g && g.projectId && g.projectId !== projectId) patch.goalId = null;
      }
    }
  }

  if (Object.keys(patch).length === 0) return ok(cur);
  return ok(await repo.updateRecurringTask(id, patch));
}

export async function listRecurringTasks(
  _ctx: ActorContext,
  repo: WorkRepo,
): Promise<Result<RecurringTaskRow[]>> {
  return ok(await repo.listRecurringTasks());
}

export async function deleteRecurringTask(
  _ctx: ActorContext,
  repo: WorkRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const cur = await repo.getRecurringTask(id);
  if (!cur) return err('NOT_FOUND', 'Esa tarea recurrente no existe');
  await repo.deleteRecurringTask(id);
  return ok({ id });
}

/** Materializa las recurrentes vencidas: por cada plantilla con next_due_on <= hoy crea
 *  UNA tarea y avanza la fecha saltando periodos perdidos (idempotente por el avance). */
export async function generateDueRecurringTasks(
  ctx: ActorContext,
  repo: WorkRepo,
  today: string,
): Promise<Result<{ created: number }>> {
  const list = await repo.listRecurringTasks();
  let created = 0;
  for (const r of list) {
    if (!r.active || r.nextDueOn > today) continue;
    const dueAt = instantFrom(r.nextDueOn, r.dueTime ?? '09:00', ctx.tz);
    await repo.insertTask({
      title: r.title,
      notes: r.notes ?? undefined,
      projectId: r.projectId ?? undefined,
      goalId: r.goalId ?? undefined,
      dueAt,
      origin: 'manual',
    });
    created++;
    let next = nextDue(r.frequency, r.nextDueOn);
    while (next <= today) next = nextDue(r.frequency, next);
    await repo.updateRecurringTask(r.id, { nextDueOn: next });
  }
  return ok({ created });
}
