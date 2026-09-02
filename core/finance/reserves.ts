import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { FinanceRepo, ReserveMovementRow, ReserveSummaryRow } from './ports';
import type { SerieMes } from './queries';
import { registrarMovimiento } from './transactions';

// Reservas (Finanzas): dos apartados de dinero.
//  · flujo      → dinero apartado para el uso diario. NO crea transacción (sale del
//                 balance conceptualmente, pero no se descuenta). Solo aportes ('in').
//  · emergencia → colchón. Aportar ('in') = GASTO real del balance en el proyecto
//                 dedicado del fondo; retirar ('out') = solo baja el fondo (peligro en UI).
// Casos de uso puros: validar → autorizar → reglas → ejecutar → Result. Un solo usuario.

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const Amount = z.number().int().positive().max(1_000_000_000_000);

const ReserveFundUpdate = z.object({
  id: z.uuid(),
  targetMinor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

const FlujoAllocation = z.object({
  fundId: z.uuid(),
  amountMinor: Amount,
  occurredOn: Ymd.optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

const EmergencyMovement = z.object({
  fundId: z.uuid(),
  direction: z.enum(['in', 'out']),
  amountMinor: Amount,
  occurredOn: Ymd.optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

/** Cambia la meta y/o la descripción de un fondo. */
export async function updateReserveFund(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = ReserveFundUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  await repo.updateReserveFund(id, patch);
  return ok({ id });
}

/** Aparta dinero al flujo de caja (movimiento 'in'). No toca el balance. */
export async function addFlujoAllocation(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<ReserveMovementRow>> {
  const parsed = FlujoAllocation.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const row = await repo.insertReserveMovement({
    fundId: parsed.data.fundId,
    direction: 'in',
    amountMinor: parsed.data.amountMinor,
    occurredOn: parsed.data.occurredOn,
    description: parsed.data.description ?? null,
  });
  return ok(row);
}

/**
 * Movimiento del fondo de emergencia.
 *  · 'in'  → crea PRIMERO el gasto del balance (proyecto dedicado del fondo) y LUEGO
 *            el movimiento del fondo con `linked_transaction_id`.
 *  · 'out' → solo el movimiento del fondo (la plata se gastó en la emergencia).
 * El fondo debe tener proyecto/área dedicados (los asegura la acción antes de llamar).
 */
export async function addEmergencyMovement(
  ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<ReserveMovementRow>> {
  const parsed = EmergencyMovement.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const d = parsed.data;

  const fund = await repo.getReserveFund('emergencia');
  if (!fund || fund.id !== d.fundId) return err('NOT_FOUND', 'Ese fondo no existe');

  let linkedTransactionId: string | null = null;
  if (d.direction === 'in') {
    if (!fund.projectId || !fund.areaId) {
      return err('RULE_VIOLATION', 'El fondo de emergencia aún no tiene proyecto dedicado');
    }
    // El aporte se registra como un GASTO del balance (no como ingreso).
    const tx = await registrarMovimiento(ctx, repo, {
      direction: 'out',
      amountMinor: d.amountMinor,
      currency: 'COP',
      areaId: fund.areaId,
      projectId: fund.projectId,
      category: 'Fondo de emergencia',
      description: d.description ?? 'Aporte al fondo de emergencia',
      occurredOn: d.occurredOn,
    });
    if (!tx.ok) return tx;
    linkedTransactionId = tx.value.id;
  }

  const row = await repo.insertReserveMovement({
    fundId: d.fundId,
    direction: d.direction,
    amountMinor: d.amountMinor,
    occurredOn: d.occurredOn,
    description: d.description ?? null,
    linkedTransactionId,
  });
  return ok(row);
}

export interface ReserveView {
  kind: 'flujo' | 'emergencia';
  targetMinor: number;
  balanceMinor: number;
  belowTarget: boolean; // saldo < meta (y hay meta)
  remainingMinor: number; // lo que falta para la meta (>= 0)
}

/** Vista de un fondo desde su fila de resumen: saldo, meta, faltante y estado. */
export function reserveView(row: ReserveSummaryRow): ReserveView {
  const remainingMinor = Math.max(0, row.targetMinor - row.balanceMinor);
  return {
    kind: row.kind,
    targetMinor: row.targetMinor,
    balanceMinor: row.balanceMinor,
    belowTarget: row.targetMinor > 0 && row.balanceMinor < row.targetMinor,
    remainingMinor,
  };
}

/**
 * Meta sugerida para el fondo de emergencia: `n` (por defecto 6) meses de gastos.
 * Usa el gasto mensual promedio de los meses con datos (hasta los últimos `n`).
 */
export function mesesDeGastos(serie: SerieMes[], n = 6): number {
  const conGasto = serie.filter((m) => m.outflowMinor > 0).slice(-n);
  if (conGasto.length === 0) return 0;
  const avg = conGasto.reduce((s, m) => s + m.outflowMinor, 0) / conGasto.length;
  return Math.round(avg * n);
}
