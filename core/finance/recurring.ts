import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { FinanceRepo, RecurringExpenseRow, RecurringFrequency, TransactionRow } from './ports';
import { registrarMovimiento } from './transactions';

const FREQUENCIES = [
  'semanal',
  'quincenal',
  'mensual',
  'bimestral',
  'trimestral',
  'anual',
] as const;

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

/** Suma meses conservando el día, sin desbordar (31 ene + 1 mes → 28/29 feb). */
function addMonths(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}
function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Próxima fecha de un gasto recurrente, a partir de una fecha base. */
export function nextDue(frequency: RecurringFrequency, fromYmd: string): string {
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

const RecurringCreate = z.object({
  direction: z.enum(['in', 'out']).default('out'),
  projectId: z.uuid(),
  areaId: z.uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000_000),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  frequency: z.enum(FREQUENCIES),
  nextDueOn: Ymd,
});

export async function createRecurringExpense(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<RecurringExpenseRow>> {
  const parsed = RecurringCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  return ok(await repo.insertRecurringExpense({ ...parsed.data, currency: 'COP' }));
}

const RecurringUpdate = z.object({
  id: z.uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000_000).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  nextDueOn: Ymd.optional(),
  active: z.boolean().optional(),
});

export async function updateRecurringExpense(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<RecurringExpenseRow>> {
  const parsed = RecurringUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getRecurringExpense(id);
  if (!cur) return err('NOT_FOUND', 'Ese gasto recurrente no existe');
  return ok(await repo.updateRecurringExpense(id, patch));
}

export async function listRecurringExpenses(
  _ctx: ActorContext,
  repo: FinanceRepo,
): Promise<Result<RecurringExpenseRow[]>> {
  return ok(await repo.listRecurringExpenses());
}

export async function deleteRecurringExpense(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const cur = await repo.getRecurringExpense(id);
  if (!cur) return err('NOT_FOUND', 'Ese gasto recurrente no existe');
  await repo.deleteRecurringExpense(id);
  return ok({ id });
}

const RecurringConfirm = z.object({
  id: z.uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000_000).optional(),
  occurredOn: Ymd.optional(),
});

/** Confirma que el gasto recurrente SÍ ocurrió: crea la transacción real (con el monto
 *  editado si se pasa) y avanza la próxima fecha. Devuelve la transacción para adjuntar
 *  comprobante si el usuario lo agrega. */
export async function confirmRecurringExpense(
  ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<TransactionRow>> {
  const parsed = RecurringConfirm.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const rec = await repo.getRecurringExpense(parsed.data.id);
  if (!rec) return err('NOT_FOUND', 'Ese gasto recurrente no existe');

  const tx = await registrarMovimiento(ctx, repo, {
    direction: rec.direction,
    amountMinor: parsed.data.amountMinor ?? rec.amountMinor,
    currency: rec.currency,
    areaId: rec.areaId,
    projectId: rec.projectId,
    category: rec.category ?? undefined,
    description: rec.description ?? undefined,
    occurredOn: parsed.data.occurredOn ?? rec.nextDueOn,
  });
  if (!tx.ok) return tx;

  await repo.updateRecurringExpense(rec.id, {
    nextDueOn: nextDue(rec.frequency, rec.nextDueOn),
  });
  return tx;
}

/** El gasto recurrente NO ocurrió esta vez: solo avanza la próxima fecha, sin crear nada. */
export async function skipRecurringExpense(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string; nextDueOn: string }>> {
  const rec = await repo.getRecurringExpense(id);
  if (!rec) return err('NOT_FOUND', 'Ese gasto recurrente no existe');
  const next = nextDue(rec.frequency, rec.nextDueOn);
  await repo.updateRecurringExpense(id, { nextDueOn: next });
  return ok({ id, nextDueOn: next });
}
