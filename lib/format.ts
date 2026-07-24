// Formato de dinero y fechas. Una sola función por cosa: dos formateadores
// distintos producen dos verdades distintas sobre el mismo número.

export function money(minor: bigint | number, opts: { compact?: boolean } = {}): string {
  const value = Number(minor) / 100;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 0,
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

/** Hora local legible de un instante ISO, en la zona del usuario. */
export function timeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
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
