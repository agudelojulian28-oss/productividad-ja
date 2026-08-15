import { z } from 'zod';

// Dinero: amount_minor = monto × 100 (bigint). base_amount_minor = COP × 100.
// fx_rate se congela al registrar (COP por 1 unidad de la moneda). Nunca float para montos.

export const INCOME_MODELS = [
  'servicio',
  'producto',
  'suscripcion',
  'empleo',
  'inversion',
  'otro',
] as const;

export const CURRENCIES = ['COP', 'USD'] as const;

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

export const IncomeSourceCreate = z.object({
  areaId: z.uuid(),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  model: z.enum(INCOME_MODELS),
});
export type IncomeSourceCreateInput = z.infer<typeof IncomeSourceCreate>;

export const MovimientoCreate = z
  .object({
    direction: z.enum(['in', 'out']),
    /** Monto en unidades menores (monto × 100), en la moneda `currency`. */
    amountMinor: z.number().int().positive().max(1_000_000_000_000),
    currency: z.enum(CURRENCIES).default('COP'),
    areaId: z.uuid(),
    /** Proyecto al que se atribuye el dinero (ingresos y gastos). ADR-026. */
    projectId: z.uuid(),
    incomeSourceId: z.uuid().optional(),
    category: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
    occurredOn: Ymd.optional(),
    /** COP por 1 unidad de la moneda (solo si currency ≠ COP). Se congela. */
    fxRate: z.number().positive().max(1_000_000).optional(),
  })
  .refine((d) => d.currency === 'COP' || !!d.fxRate, {
    message: 'Un movimiento en USD necesita la tasa de cambio',
    path: ['fxRate'],
  });
export type MovimientoCreateInput = z.infer<typeof MovimientoCreate>;

/** Edición parcial de un movimiento. Todo opcional salvo el id; al cambiar de
 *  proyecto hay que pasar también el área (el área sale del proyecto). El base COP
 *  se recalcula desde los valores efectivos (monto/moneda/tasa). */
export const MovimientoUpdate = z
  .object({
    id: z.uuid(),
    direction: z.enum(['in', 'out']).optional(),
    amountMinor: z.number().int().positive().max(1_000_000_000_000).optional(),
    currency: z.enum(CURRENCIES).optional(),
    fxRate: z.number().positive().max(1_000_000).optional(),
    projectId: z.uuid().optional(),
    areaId: z.uuid().optional(),
    category: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    occurredOn: Ymd.optional(),
  })
  .refine((d) => !d.projectId || !!d.areaId, {
    message: 'Al cambiar de proyecto indica también el área',
    path: ['areaId'],
  });
export type MovimientoUpdateInput = z.infer<typeof MovimientoUpdate>;

// Metas de dinero. Miden contra las transacciones vía la vista goal_progress:
//  money_in = ingresos del periodo; money_net = ingresos − gastos. El objetivo va
//  en pesos (COP base), acotado a un área o a una fuente. project_id queda null.
export const MONEY_METRICS = ['money_in', 'money_net'] as const;

export const MoneyGoalCreate = z
  .object({
    title: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    metric: z.enum(MONEY_METRICS),
    /** Objetivo en pesos (COP), no en centavos. */
    targetValue: z.number().positive().max(1_000_000_000_000),
    /** Proyecto al que se atribuye la meta de dinero (ADR-026). */
    projectId: z.uuid(),
    areaId: z.uuid().optional(),
    incomeSourceId: z.uuid().optional(),
    periodStart: Ymd,
    periodEnd: Ymd,
  })
  .refine((d) => d.periodStart <= d.periodEnd, {
    message: 'El inicio no puede ser posterior al cumplimiento',
    path: ['periodEnd'],
  });
export type MoneyGoalCreateInput = z.infer<typeof MoneyGoalCreate>;
