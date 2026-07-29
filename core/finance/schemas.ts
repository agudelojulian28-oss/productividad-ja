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
    incomeSourceId: z.uuid().optional(),
    category: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
    occurredOn: Ymd.optional(),
    /** COP por 1 unidad de la moneda (solo si currency ≠ COP). Se congela. */
    fxRate: z.number().positive().max(1_000_000).optional(),
  })
  .refine((d) => d.direction === 'out' || !!d.incomeSourceId, {
    message: 'Un ingreso necesita una fuente de ingreso',
    path: ['incomeSourceId'],
  })
  .refine((d) => d.currency === 'COP' || !!d.fxRate, {
    message: 'Un movimiento en USD necesita la tasa de cambio',
    path: ['fxRate'],
  });
export type MovimientoCreateInput = z.infer<typeof MovimientoCreate>;
