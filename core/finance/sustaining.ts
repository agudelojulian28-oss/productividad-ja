import { z } from 'zod';
import { ok, err, type Result, type ActorContext } from '@/core/types';
import type { FinanceRepo, SustainingServiceRow, SustainingCadence } from './ports';

// Sostenimiento (ADR-031): servicios que cuestan operar la app. Casos de uso
// validar→autorizar→reglas→ejecutar→Result. `sustainingSummary` es puro (testeable).

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const CATEGORY = ['infra', 'ia', 'canal', 'dominio', 'otro'] as const;
const STATUS = ['paga', 'gratis', 'futuro'] as const;
const CADENCE = ['mensual', 'anual', 'uso', 'unico'] as const;
const Amount = z.number().int().min(0).max(1_000_000_000_000);

const SustainingCreate = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  provider: z.string().trim().max(80).nullable().optional(),
  category: z.enum(CATEGORY).default('otro'),
  status: z.enum(STATUS).default('paga'),
  cadence: z.enum(CADENCE).default('mensual'),
  amountMinor: Amount.default(0),
  balanceMinor: Amount.nullable().optional(),
  alertThresholdMinor: Amount.nullable().optional(),
  renewsOn: Ymd.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const SustainingUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  provider: z.string().trim().max(80).nullable().optional(),
  category: z.enum(CATEGORY).optional(),
  status: z.enum(STATUS).optional(),
  cadence: z.enum(CADENCE).optional(),
  amountMinor: Amount.optional(),
  balanceMinor: Amount.nullable().optional(),
  alertThresholdMinor: Amount.nullable().optional(),
  renewsOn: Ymd.nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function createSustaining(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<SustainingServiceRow>> {
  const parsed = SustainingCreate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  return ok(
    await repo.insertSustaining({
      name: parsed.data.name,
      provider: parsed.data.provider ?? null,
      category: parsed.data.category,
      status: parsed.data.status,
      cadence: parsed.data.cadence,
      amountMinor: parsed.data.amountMinor,
      balanceMinor: parsed.data.balanceMinor ?? null,
      alertThresholdMinor: parsed.data.alertThresholdMinor ?? null,
      renewsOn: parsed.data.renewsOn ?? null,
      notes: parsed.data.notes ?? null,
    }),
  );
}

export async function updateSustaining(
  _ctx: ActorContext,
  repo: FinanceRepo,
  raw: unknown,
): Promise<Result<SustainingServiceRow>> {
  const parsed = SustainingUpdate.safeParse(raw);
  if (!parsed.success) return err('INVALID_INPUT', 'Datos inválidos', parsed.error.issues);
  const { id, ...patch } = parsed.data;
  const cur = await repo.getSustaining(id);
  if (!cur) return err('NOT_FOUND', 'Ese servicio no existe');
  return ok(await repo.updateSustaining(id, patch));
}

export async function listSustaining(
  _ctx: ActorContext,
  repo: FinanceRepo,
): Promise<Result<SustainingServiceRow[]>> {
  return ok(await repo.listSustaining());
}

export async function deleteSustaining(
  _ctx: ActorContext,
  repo: FinanceRepo,
  id: string,
): Promise<Result<{ id: string }>> {
  const cur = await repo.getSustaining(id);
  if (!cur) return err('NOT_FOUND', 'Ese servicio no existe');
  await repo.deleteSustaining(id);
  return ok({ id });
}

/** Costo mensual-equivalente de un servicio según su cadencia. */
export function monthlyEquivalent(amountMinor: number, cadence: SustainingCadence): number {
  switch (cadence) {
    case 'mensual':
      return amountMinor;
    case 'anual':
      return Math.round(amountMinor / 12);
    case 'uso':
      return amountMinor; // estimado mensual de uso
    case 'unico':
      return 0; // pago único no es sostenimiento recurrente
  }
}

function addDaysYmd(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export interface SustainingAlert {
  id: string;
  name: string;
  kind: 'recargar' | 'renovacion';
  balanceMinor: number | null;
  renewsOn: string | null;
}
export interface SustainingSummary {
  monthlyTotalMinor: number; // suma de las pagas (mensual-equivalente)
  futurosMinor: number; // posible a futuro (mensual-equivalente de los 'futuro')
  count: number; // servicios activos
  alerts: SustainingAlert[];
}

/** Resumen del sostenimiento: total mensual, posible futuro y alertas (recarga/renovación). */
export function sustainingSummary(
  services: SustainingServiceRow[],
  today: string,
  renewWindowDays = 5,
): SustainingSummary {
  let monthlyTotalMinor = 0;
  let futurosMinor = 0;
  let count = 0;
  const alerts: SustainingAlert[] = [];
  const soon = addDaysYmd(today, renewWindowDays);

  for (const s of services) {
    if (!s.active) continue;
    count++;
    const eq = monthlyEquivalent(s.amountMinor, s.cadence);
    if (s.status === 'paga') monthlyTotalMinor += eq;
    else if (s.status === 'futuro') futurosMinor += eq;

    if (s.balanceMinor !== null && s.alertThresholdMinor !== null && s.balanceMinor <= s.alertThresholdMinor) {
      alerts.push({ id: s.id, name: s.name, kind: 'recargar', balanceMinor: s.balanceMinor, renewsOn: null });
    }
    if (s.renewsOn !== null && s.renewsOn <= soon) {
      alerts.push({ id: s.id, name: s.name, kind: 'renovacion', balanceMinor: null, renewsOn: s.renewsOn });
    }
  }
  return { monthlyTotalMinor, futurosMinor, count, alerts };
}
