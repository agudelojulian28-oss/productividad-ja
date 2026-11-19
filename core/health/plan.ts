// Reductores puros del plan de salud. Sin E/S: la página, Hoy y el agente leen
// EXACTAMENTE estas funciones sobre los mismos datos (no pueden discrepar).

import type { CheckinRow, GroceryFrequency, GroceryRow, HealthItemRow, HealthSection } from './ports';

export const SECTION_ORDER: HealthSection[] = ['espiritual', 'cuerpo', 'entrenamiento', 'dieta'];
export const WEEKDAY_SHORT = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'] as const; // índice = iso-1
export const WEEKDAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

/** Día ISO (1=lunes … 7=domingo) de un 'YYYY-MM-DD' (calendario, sin zona horaria). */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const js = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0=domingo
  return js === 0 ? 7 : js;
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** ¿El elemento aplica ese día? (activo y, si tiene días, el día está incluido). */
export function appliesOn(item: HealthItemRow, ymd: string): boolean {
  if (!item.active) return false;
  if (!item.weekdays || item.weekdays.length === 0) return true;
  return item.weekdays.includes(isoWeekday(ymd));
}

const bySectionTimeOrder = (a: HealthItemRow, b: HealthItemRow) =>
  SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
  (a.timeOfDay ?? '99').localeCompare(b.timeOfDay ?? '99') ||
  a.sortOrder - b.sortOrder;

/** Lo que toca marcar ese día: elementos raíz con seguimiento que aplican. */
export function checklistForDay(items: HealthItemRow[], ymd: string): HealthItemRow[] {
  return items.filter((i) => i.parentId === null && i.trackable && appliesOn(i, ymd)).sort(bySectionTimeOrder);
}

/** La rutina de entrenamiento de ese día (o null = descanso). */
export function routineForDay(items: HealthItemRow[], ymd: string): HealthItemRow | null {
  return (
    items
      .filter((i) => i.section === 'entrenamiento' && i.kind === 'rutina' && appliesOn(i, ymd))
      .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null
  );
}

/** Semana de entrenamiento: para cada día ISO 1..7, la rutina asignada (o null). */
export function weekSchedule(items: HealthItemRow[]): (HealthItemRow | null)[] {
  const rutinas = items
    .filter((i) => i.section === 'entrenamiento' && i.kind === 'rutina' && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return [1, 2, 3, 4, 5, 6, 7].map(
    (d) => rutinas.find((r) => !r.weekdays || r.weekdays.length === 0 || r.weekdays.includes(d)) ?? null,
  );
}

export function childrenOf(items: HealthItemRow[], parentId: string): HealthItemRow[] {
  return items.filter((i) => i.parentId === parentId && i.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Cumplimiento de un día: marcados / que tocaban. */
export function dayCompletion(
  items: HealthItemRow[],
  checkins: CheckinRow[],
  ymd: string,
): { done: number; total: number } {
  const due = checklistForDay(items, ymd);
  const done = new Set(checkins.filter((c) => c.day === ymd).map((c) => c.itemId));
  return { done: due.filter((i) => done.has(i.id)).length, total: due.length };
}

/** Días seguidos cumplidos al 100%, contando hacia atrás. Si hoy aún no está completo,
 *  la racha cuenta desde ayer (hoy todavía está en curso). Días sin nada que marcar no cortan. */
export function streak(items: HealthItemRow[], checkins: CheckinRow[], today: string, maxDays = 120): number {
  let count = 0;
  let cursor = today;
  const hoy = dayCompletion(items, checkins, today);
  if (hoy.total > 0 && hoy.done < hoy.total) cursor = addDaysYmd(today, -1);
  for (let i = 0; i < maxDays; i++) {
    const c = dayCompletion(items, checkins, cursor);
    if (c.total > 0) {
      if (c.done < c.total) break;
      count++;
    }
    cursor = addDaysYmd(cursor, -1);
  }
  return count;
}

/** % de cumplimiento de los últimos 7 días (hoy incluido). */
export function weekCompletionPct(items: HealthItemRow[], checkins: CheckinRow[], today: string): number {
  let done = 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const c = dayCompletion(items, checkins, addDaysYmd(today, -i));
    done += c.done;
    total += c.total;
  }
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

const FACTOR: Record<GroceryFrequency, number> = {
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  anual: 1 / 12,
};

/** Costo mensual-equivalente de la lista de mercado (ítems activos). */
export function groceryMonthlyMinor(items: GroceryRow[]): number {
  return Math.round(items.filter((g) => g.active).reduce((s, g) => s + g.costMinor * FACTOR[g.frequency], 0));
}
