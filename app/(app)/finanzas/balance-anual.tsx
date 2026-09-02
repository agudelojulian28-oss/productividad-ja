'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { aniosConDatos, serieAnioMensual, totalesAnio, type SerieMes } from '@/core/finance/queries';
import { MiniMountain } from './mini-mountain';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type Modo = 'mensual' | 'acumulado';

/**
 * Resumen anual del balance: montaña (balance de cada mes o acumulado del año) +
 * tabla mes a mes, con navegación de año. Una sola serie → una sola hue (dataviz).
 * Lee series ya plegadas por SQL; los reductores por año viven en core (puros).
 */
export function BalanceAnual({ serie, today }: { serie: SerieMes[]; today: string }) {
  const currentYear = Number(today.slice(0, 4));
  const currentMonthIdx = Number(today.slice(5, 7)) - 1; // 0-based

  const years = useMemo(() => {
    const ys = aniosConDatos(serie);
    if (!ys.includes(currentYear)) ys.push(currentYear);
    return ys.sort((a, b) => a - b);
  }, [serie, currentYear]);

  const [year, setYear] = useState(currentYear);
  const [modo, setModo] = useState<Modo>('mensual');

  const meses = useMemo(() => serieAnioMensual(serie, year), [serie, year]);
  // En el año en curso solo mostramos hasta el mes actual; en años pasados, los 12.
  const lastIdx = year === currentYear ? currentMonthIdx : 11;
  const visibles = meses.slice(0, lastIdx + 1);
  const totales = useMemo(() => totalesAnio(visibles), [visibles]);

  // Serie de la montaña: balance mensual o acumulado corrido del año.
  const chartValues = useMemo(() => {
    if (modo === 'mensual') return visibles.map((m) => m.netMinor);
    let run = 0;
    return visibles.map((m) => (run += m.netMinor));
  }, [visibles, modo]);
  const chartLabels = visibles.map((_, i) => MESES[i]!);

  const yearIdx = years.indexOf(year);
  const canPrev = yearIdx > 0;
  const canNext = yearIdx < years.length - 1;

  return (
    <div className="ba">
      <div className="ba-head">
        <div className="ba-nav">
          <button
            type="button"
            className="ba-arrow"
            aria-label="Año anterior"
            disabled={!canPrev}
            onClick={() => canPrev && setYear(years[yearIdx - 1]!)}
          >
            ‹
          </button>
          <span className="ba-year">{year}</span>
          <button
            type="button"
            className="ba-arrow"
            aria-label="Año siguiente"
            disabled={!canNext}
            onClick={() => canNext && setYear(years[yearIdx + 1]!)}
          >
            ›
          </button>
        </div>
        <div className="ba-modes" role="tablist" aria-label="Tipo de balance">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'mensual'}
            className={`ba-mode${modo === 'mensual' ? ' on' : ''}`}
            onClick={() => setModo('mensual')}
          >
            Mensual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'acumulado'}
            className={`ba-mode${modo === 'acumulado' ? ' on' : ''}`}
            onClick={() => setModo('acumulado')}
          >
            Acumulado
          </button>
        </div>
      </div>

      <div className="ba-total">
        <span className="ba-total-k">Balance {year}</span>
        <span className={`ba-total-v ${totales.netMinor >= 0 ? 'pos' : 'neg'}`}>
          {money(totales.netMinor, { compact: true })}
        </span>
      </div>

      {/* Montaña: balance mensual (o acumulado) del año */}
      <MiniMountain labels={chartLabels} values={chartValues} tone="accent" height={92} showZero />

      {/* Tabla mes a mes */}
      <div className="ba-table-wrap">
        <table className="ba-table">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Ingresos</th>
              <th scope="col">Gastos</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m, i) => {
              const vacio = m.inflowMinor === 0 && m.outflowMinor === 0;
              return (
                <tr key={m.month} className={i === currentMonthIdx && year === currentYear ? 'ba-now' : undefined}>
                  <th scope="row">{MESES[i]}</th>
                  {vacio ? (
                    <td className="ba-empty" colSpan={3}>
                      —
                    </td>
                  ) : (
                    <>
                      <td>{money(m.inflowMinor, { compact: true })}</td>
                      <td>{money(m.outflowMinor, { compact: true })}</td>
                      <td className={m.netMinor >= 0 ? 'pos' : 'neg'}>{money(m.netMinor, { compact: true })}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{money(totales.inflowMinor, { compact: true })}</td>
              <td>{money(totales.outflowMinor, { compact: true })}</td>
              <td className={totales.netMinor >= 0 ? 'pos' : 'neg'}>{money(totales.netMinor, { compact: true })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
