import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import { MovimientoCreate, MovimientoUpdate } from './schemas';
import type { FinanceRepo, TransactionRow } from './ports';

// YMD de hoy en la zona del usuario (aritmética de fechas nunca en UTC).
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Registra un movimiento de dinero.
 * `base_amount_minor` (COP × 100) se congela al registrar:
 *  - COP: fx=1, base = amount_minor.
 *  - USD: base = round(amount_minor × fxRate). La tasa queda guardada.
 */
export async function registrarMovimiento(
  ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<TransactionRow>> {
  const parsed = MovimientoCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);

  const d = parsed.data;

  // El dinero se atribuye a un proyecto (ADR-026). La fuente de ingreso es legado
  // opcional; si viene, se valida que sea del mismo área.
  if (d.incomeSourceId) {
    const src = await repo.getIncomeSource(d.incomeSourceId);
    if (!src) return err('NOT_FOUND', 'La fuente de ingreso no existe');
    if (src.areaId !== d.areaId) {
      return err('RULE_VIOLATION', 'La fuente de ingreso no pertenece a esa área');
    }
  }

  // Congelar la conversión a COP.
  const fxRate = d.currency === 'COP' ? 1 : d.fxRate!;
  const baseAmountMinor =
    d.currency === 'COP' ? d.amountMinor : Math.round(d.amountMinor * fxRate);

  const row = await repo.insertTransaction({
    areaId: d.areaId,
    projectId: d.projectId,
    incomeSourceId: d.direction === 'in' ? d.incomeSourceId : undefined,
    direction: d.direction,
    amountMinor: d.amountMinor,
    currency: d.currency,
    baseAmountMinor,
    fxRate,
    occurredOn: d.occurredOn ?? todayInTz(ctx.tz),
    category: d.category,
    description: d.description,
  });
  return ok(row);
}

/**
 * Edita un movimiento existente. Recalcula `base_amount_minor` desde los valores
 * efectivos (monto/moneda/tasa) y, si cambia de proyecto, actualiza el área.
 * Ownership por RLS + verificación explícita (getTransaction devuelve null si no
 * es del usuario → NOT_FOUND).
 */
export async function updateTransaction(
  ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<TransactionRow>> {
  const parsed = MovimientoUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;

  const cur = await repo.getTransaction(d.id);
  if (!cur) return err('NOT_FOUND', 'El movimiento no existe');

  const direction = d.direction ?? cur.direction;
  const currency = d.currency ?? cur.currency;
  const amountMinor = d.amountMinor ?? cur.amountMinor;
  const fxRate = currency === 'COP' ? 1 : (d.fxRate ?? cur.fxRate);
  if (currency !== 'COP' && !(fxRate > 0)) {
    return err('INVALID_INPUT', 'Un movimiento en USD necesita la tasa de cambio');
  }
  const baseAmountMinor = currency === 'COP' ? amountMinor : Math.round(amountMinor * fxRate);

  const row = await repo.updateTransaction(d.id, {
    direction,
    amountMinor,
    currency,
    fxRate,
    baseAmountMinor,
    areaId: d.projectId ? d.areaId! : cur.areaId,
    projectId: d.projectId ?? cur.projectId,
    category: d.category !== undefined ? d.category : cur.category,
    description: d.description !== undefined ? d.description : cur.description,
    occurredOn: d.occurredOn ?? cur.occurredOn,
  });
  return ok(row);
}

/** Borra un movimiento. Ownership por RLS + verificación explícita. */
export async function deleteTransaction(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  if (!z.uuid().safeParse(id).success) return err('INVALID_INPUT', 'ID inválido');
  const cur = await repo.getTransaction(id);
  if (!cur) return err('NOT_FOUND', 'El movimiento no existe');
  await repo.deleteTransaction(id);
  return ok({ id });
}
