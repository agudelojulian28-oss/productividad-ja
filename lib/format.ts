// Formato de dinero y fechas. Una sola función por cosa: dos formateadores
// distintos producen dos verdades distintas sobre el mismo número.

export function money(
  minor: bigint | number,
  opts: { compact?: boolean; currency?: 'COP' | 'USD' } = {},
): string {
  const currency = opts.currency ?? 'COP';
  const value = Number(minor) / 100;
  // COP no usa centavos; USD sí (2 decimales).
  const fractionDigits = currency === 'USD' ? 2 : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : fractionDigits,
  }).format(value);
}

/** Fecha de hoy (YYYY-MM-DD) en la zona del usuario, no en UTC. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Fecha local (YYYY-MM-DD) de un instante ISO, en la zona del usuario. */
export function dateInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
}

/** Hora local legible (12 h con a. m./p. m.) de un instante ISO, en la zona del usuario. */
export function timeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** Etiqueta corta de día (ej. "mié 24 jul") en la zona del usuario. */
export function dayLabelInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** Minutos desde medianoche (0–1439) de un instante ISO, en la zona del usuario.
 *  Sirve para posicionar eventos en la rejilla horaria del calendario. */
export function minutesInTz(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) * 60 + m;
}
