// Convierte lo que teclea el usuario a unidades menores (monto × 100), sin float
// para el resultado. Acepta separadores de miles y decimales mezclados (es-CO usa
// '.' para miles y ',' para decimales; en-US al revés): se toma como separador
// decimal el último '.' o ',' seguido de 1–2 dígitos al final; el resto son miles.
//
//   "50000"    → 5_000_000   (50.000 COP)
//   "50.000"   → 5_000_000   ('.' = miles)
//   "12,50"    → 1_250        (',' = decimal)
//   "12.50"    → 1_250        ('.' = decimal)
//   "1.234,56" → 123_456
export function parseAmountToMinor(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s || !/^[0-9]+([.,][0-9]+)*$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let intPart: string;
  let fracPart: string;

  if (lastSep === -1) {
    intPart = s;
    fracPart = '';
  } else {
    const after = s.slice(lastSep + 1);
    if (after.length >= 1 && after.length <= 2) {
      // separador decimal
      intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
      fracPart = after;
    } else {
      // separador de miles
      intPart = s.replace(/[.,]/g, '');
      fracPart = '';
    }
  }

  const cents = (fracPart + '00').slice(0, 2);
  const minor = Number(intPart) * 100 + Number(cents);
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}
