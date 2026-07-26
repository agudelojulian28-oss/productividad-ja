// Construye la regla de recurrencia (RRULE de RFC 5545) que espera Google Calendar
// a partir de una descripción estructurada. Puro: sin dependencias externas.

export interface Recurrencia {
  frecuencia: 'diaria' | 'semanal' | 'mensual' | 'anual' | 'ninguna';
  /** Cada cuántos periodos (cada 2 semanas = intervalo 2). Por defecto 1. */
  intervalo?: number;
  /** Solo para 'semanal': días de la semana. */
  dias_semana?: ('LU' | 'MA' | 'MI' | 'JU' | 'VI' | 'SA' | 'DO')[];
  /** Fin por fecha (YYYY-MM-DD). Excluyente con `veces`. */
  hasta?: string;
  /** Fin por número de repeticiones. Excluyente con `hasta`. */
  veces?: number;
}

const FREQ: Record<Exclude<Recurrencia['frecuencia'], 'ninguna'>, string> = {
  diaria: 'DAILY',
  semanal: 'WEEKLY',
  mensual: 'MONTHLY',
  anual: 'YEARLY',
};

const DAY: Record<NonNullable<Recurrencia['dias_semana']>[number], string> = {
  LU: 'MO',
  MA: 'TU',
  MI: 'WE',
  JU: 'TH',
  VI: 'FR',
  SA: 'SA',
  DO: 'SU',
};

/** Devuelve el arreglo `recurrence` para la API de Google.
 *  `[]` significa "quitar la recurrencia" (evento pasa a único). */
export function buildRecurrence(r: Recurrencia): string[] {
  if (r.frecuencia === 'ninguna') return [];

  const parts = [`FREQ=${FREQ[r.frecuencia]}`];
  if (r.intervalo && r.intervalo > 1) parts.push(`INTERVAL=${r.intervalo}`);
  if (r.frecuencia === 'semanal' && r.dias_semana?.length) {
    parts.push(`BYDAY=${r.dias_semana.map((d) => DAY[d]).join(',')}`);
  }
  if (r.hasta) parts.push(`UNTIL=${r.hasta.replace(/-/g, '')}T235959Z`);
  else if (r.veces) parts.push(`COUNT=${r.veces}`);

  return [`RRULE:${parts.join(';')}`];
}
