import { money } from '@/lib/format';

export type MovRow = {
  id: string;
  direction: 'in' | 'out';
  baseAmountMinor: number;
  occurredOn: string;
  title: string; // descripción, o categoría, o "Ingreso/Gasto"
  areaName: string;
  receiptUrl: string | null;
};

// Lista de movimientos recientes con su descripción y comprobante (referencia:
// "Transaction History" / "Recent Transactions"). Datos ya resueltos en el servidor.
export function MovimientosRecientes({ rows }: { rows: MovRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">Aún no hay movimientos registrados.</p>;
  }
  return (
    <div className="mov-list">
      {rows.map((m) => (
        <div key={m.id} className="mov-row">
          <div className="mov-thumb">
            {m.receiptUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.receiptUrl} alt="comprobante" />
            ) : (
              <span className="mov-thumb-empty" aria-hidden="true">
                {m.direction === 'in' ? '↘' : '↗'}
              </span>
            )}
          </div>
          <div className="mov-body">
            <span className="mov-title">{m.title}</span>
            <span className="mov-meta">
              {m.areaName} · {m.occurredOn}
              {m.receiptUrl ? ' · 📎 comprobante' : ''}
            </span>
          </div>
          <span className={`mov-amt ${m.direction === 'in' ? 'fin-pos' : 'fin-neg'}`}>
            {m.direction === 'in' ? '+' : '−'}
            {money(m.baseAmountMinor, { compact: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
