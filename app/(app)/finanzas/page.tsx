import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import {
  resumenFinanciero,
  serieMensual,
  topGastos,
  porFuente,
} from '@/core/finance/queries';
import { money, todayInTz } from '@/lib/format';
import { RealtimeRefresh } from '../realtime-refresh';
import { RegistrarMovimiento } from './registrar-movimiento';
import { FuentesManager } from './fuentes-manager';
import { CashflowChart } from './cashflow-chart';
import { MetasDinero } from './metas-dinero';
import { BarList } from './bar-list';
import { Disclosure } from '../disclosure';

export const dynamic = 'force-dynamic';

function pctDelta(thisM: number, lastM: number): { txt: string; up: boolean | null } {
  if (lastM <= 0) return thisM > 0 ? { txt: 'nuevo', up: true } : { txt: '—', up: null };
  const pct = Math.round(((thisM - lastM) / lastM) * 100);
  if (pct === 0) return { txt: '0%', up: null };
  return { txt: `${pct > 0 ? '+' : ''}${pct}%`, up: pct > 0 };
}

export default async function FinanzasPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const finance = financeRepo(supabase, ctx.userId);

  const [areas, sources, cashflow, bySrc, expenses, metas] = await Promise.all([
    structure.listAreas(),
    finance.listIncomeSources(),
    finance.cashflowMonthly(),
    finance.bySource(),
    finance.expensesByCategory(),
    finance.moneyGoalsProgress(),
  ]);

  const resumen = resumenFinanciero(cashflow, ctx.tz);
  const serie = serieMensual(cashflow, 6);
  const gastos = topGastos(expenses, ctx.tz, 5);
  const fuentes = porFuente(bySrc);
  const dim = resumen.stale ? ' fin-dim' : '';

  const areaOpts = areas.map((a) => ({ id: a.id, name: a.name }));
  const sourceOpts = sources.map((s) => ({
    id: s.id,
    name: s.name,
    areaId: s.areaId,
    model: s.model,
  }));

  return (
    <div className="page">
      <RealtimeRefresh tables={['transactions', 'income_sources']} />
      <h1 className="page-title">Finanzas</h1>

      {resumen.stale && (
        <div className="fin-stale" role="status">
          ⚠ Último movimiento registrado hace {resumen.staleDays} días. Las cifras de
          flujo pueden estar desactualizadas.
        </div>
      )}

      {/* ① Por cobrar — llega en la Etapa 5 (depende de ventas) */}
      <section className="fin-block fin-block-empty">
        <h2 className="fin-h2">① Por cobrar</h2>
        <p className="muted">Llega en la Etapa 5, con las ventas.</p>
      </section>

      <div className="fin-cards">
        <div className={`fin-card${dim}`}>
          <span className="fin-card-label">② Este mes (ingresos)</span>
          <span className="fin-figure">{money(resumen.inflowMinor, { compact: true })}</span>
        </div>
        <div className={`fin-card${dim}`}>
          <span className="fin-card-label">③ Neto del mes</span>
          <span
            className={`fin-figure ${resumen.netMinor >= 0 ? 'fin-pos' : 'fin-neg'}`}
          >
            {money(resumen.netMinor, { compact: true })}
          </span>
          <span className="fin-card-sub">
            Entró {money(resumen.inflowMinor, { compact: true })} · Salió{' '}
            {money(resumen.outflowMinor, { compact: true })}
          </span>
        </div>
      </div>

      <section className="fin-block">
        <h2 className="fin-h2">Flujo de caja (neto por mes)</h2>
        <CashflowChart serie={serie} />
      </section>

      <section className="fin-block">
        <h2 className="fin-h2">④ Por fuente de ingreso</h2>
        {fuentes.length === 0 ? (
          <p className="muted">Sin fuentes con ingresos aún.</p>
        ) : (
          <BarList
            items={fuentes.map((f) => {
              const d = pctDelta(f.thisMonthMinor, f.lastMonthMinor);
              return {
                label: f.name,
                value: f.thisMonthMinor,
                valueLabel: money(f.thisMonthMinor),
                delta: { text: d.txt, up: d.up },
              };
            })}
            tone="accent"
          />
        )}
      </section>

      <section className="fin-block">
        <h2 className="fin-h2">⑤ Gastos — top 5 del mes</h2>
        {gastos.length === 0 ? (
          <p className="muted">Sin gastos registrados este mes.</p>
        ) : (
          <BarList
            items={gastos.map((g) => ({
              label: g.category,
              value: g.amountMinor,
              valueLabel: money(g.amountMinor),
            }))}
            tone="muted"
          />
        )}
      </section>

      {areas.length > 0 && (
        <section className="fin-block">
          <h2 className="fin-h2">Metas de dinero</h2>
          <MetasDinero
            areas={areaOpts}
            sources={sourceOpts}
            metas={metas.map((m) => ({
              goalId: m.goalId,
              title: m.title,
              metric: m.metric,
              targetValue: m.targetValue,
              currentValue: m.currentValue,
              periodEnd: m.periodEnd,
            }))}
            today={todayInTz(ctx.tz)}
          />
        </section>
      )}

      {/* ⑥⑦ dependen de ventas (Etapa 5) */}
      <section className="fin-block fin-block-empty">
        <h2 className="fin-h2">⑥ Pipeline abierto</h2>
        <p className="muted">Llega en la Etapa 5, con las ventas.</p>
      </section>
      <section className="fin-block fin-block-empty">
        <h2 className="fin-h2">⑦ Discrepancias</h2>
        <p className="muted">Llega en la Etapa 5, con las ventas.</p>
      </section>

      {areas.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Para registrar dinero, primero crea un área en{' '}
          <Link href="/areas" className="link">
            Áreas
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="fin-section">
            <h2 className="fin-h2">Registrar movimiento</h2>
            <RegistrarMovimiento
              areas={areaOpts}
              sources={sourceOpts}
              today={todayInTz(ctx.tz)}
            />
          </section>

          <Disclosure title="Fuentes de ingreso" count={sourceOpts.length}>
            <FuentesManager areas={areaOpts} sources={sourceOpts} />
          </Disclosure>
        </>
      )}
    </div>
  );
}
