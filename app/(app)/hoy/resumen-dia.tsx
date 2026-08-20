import { money } from '@/lib/format';
import { Disclosure } from '../disclosure';
import { DiaCashChart, type DayPoint } from './dia-cash-chart';

export type ProjIncome = { label: string; value: number };

/**
 * Resumen financiero del día en Hoy: ingresos/gastos/neto de hoy, y una gráfica de
 * ingresos (verde) vs gastos (rojo) de los últimos días, con desglose por proyecto al
 * pasar el cursor. Datos ya resueltos en el servidor.
 */
export function ResumenDia({
  inToday,
  outToday,
  days,
}: {
  inToday: number;
  outToday: number;
  days: DayPoint[];
}) {
  const net = inToday - outToday;
  const hayDatos = days.some((d) => d.inflow > 0 || d.outflow > 0);

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

        {hayDatos ? (
          <DiaCashChart days={days} />
        ) : (
          <p className="muted dia-empty">Sin movimientos en los últimos días.</p>
        )}
      </Disclosure>
    </section>
  );
}
