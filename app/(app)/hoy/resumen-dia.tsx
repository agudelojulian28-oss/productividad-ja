import { money } from '@/lib/format';
import { Disclosure } from '../disclosure';

export type ProjIncome = { label: string; value: number };

/**
 * Resumen financiero del día en Hoy: ingresos/gastos/neto y el desglose de lo
 * facturado por proyecto. Desplegable (colapsa en móvil, abierto en escritorio).
 * Datos ya resueltos en el servidor.
 */
export function ResumenDia({
  inToday,
  outToday,
  byProject,
}: {
  inToday: number;
  outToday: number;
  byProject: ProjIncome[];
}) {
  const net = inToday - outToday;
  const max = Math.max(1, ...byProject.map((p) => p.value));

  return (
    <section className="task-section dia-section">
      <Disclosure title="Facturado hoy" count={money(inToday, { compact: true })}>
        <div className="dia-cells">
          <div className="dia-cell">
            <span className="dia-cell-k">Ingresos</span>
            <span className="dia-cell-v fin-pos">{money(inToday, { compact: true })}</span>
          </div>
          <div className="dia-cell">
            <span className="dia-cell-k">Gastos</span>
            <span className="dia-cell-v fin-neg">{money(outToday, { compact: true })}</span>
          </div>
          <div className="dia-cell">
            <span className="dia-cell-k">Balance</span>
            <span className={`dia-cell-v ${net >= 0 ? 'fin-pos' : 'fin-neg'}`}>
              {money(net, { compact: true })}
            </span>
          </div>
        </div>

        {byProject.length === 0 ? (
          <p className="muted dia-empty">Aún no has facturado hoy.</p>
        ) : (
          <div className="dia-bars">
            {byProject.map((p) => (
              <div key={p.label} className="dia-bar-row">
                <div className="dia-bar-head">
                  <span className="dia-bar-name">{p.label}</span>
                  <span className="dia-bar-val">{money(p.value, { compact: true })}</span>
                </div>
                <div className="dia-bar-track">
                  <div
                    className="dia-bar-fill"
                    style={{ width: `${Math.max(3, Math.round((p.value / max) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Disclosure>
    </section>
  );
}
