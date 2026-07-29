import { ok, err, type Result, type ActorContext } from '@/core/types';
import { MovimientoCreate } from './schemas';
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

  // Regla: un ingreso necesita una fuente, y la fuente debe ser del mismo área.
  if (d.direction === 'in') {
    if (!d.incomeSourceId) return err('RULE_VIOLATION', 'Un ingreso necesita una fuente de ingreso');
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
