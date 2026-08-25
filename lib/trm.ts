// TRM (Tasa Representativa del Mercado): COP por 1 USD, oficial de Colombia.
// Fuente: datos abiertos (Superintendencia Financiera) vía Socrata. Sin API key.
// Se cachea 12 h con la caché de fetch de Next. Si falla, cae a un valor de respaldo
// para no romper la app (la conversión es un estimado; en movimientos la tasa es editable).

const TRM_URL =
  'https://www.datos.gov.co/resource/32sa-8pi3.json?$select=valor,vigenciahasta&$order=vigenciahasta%20DESC&$limit=1';
const FALLBACK_TRM = 4000;

export interface Trm {
  value: number; // COP por 1 USD
  date: string; // 'YYYY-MM-DD' de vigencia (o '' si fallback)
  fallback: boolean;
}

export async function getTrm(): Promise<Trm> {
  try {
    const res = await fetch(TRM_URL, { next: { revalidate: 43_200 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const rows = (await res.json()) as { valor?: string; vigenciahasta?: string }[];
    const raw = rows?.[0]?.valor;
    const value = raw ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value <= 0) throw new Error('valor inválido');
    return { value, date: (rows[0]?.vigenciahasta ?? '').slice(0, 10), fallback: false };
  } catch {
    return { value: FALLBACK_TRM, date: '', fallback: true };
  }
}
