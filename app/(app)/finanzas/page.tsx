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
import { PageHero } from '../page-hero';

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
      <PageHero
        eyebrow="Este mes"
        title="Finanzas"
        subtitle={`Entró ${money(resumen.inflowMinor, { compact: true })} · Salió ${money(
          resumen.outflowMinor,
          { compact: true },
        )}`}
        kpis={[
          {
            label: 'Neto del mes',
            value: money(resumen.netMinor, { compact: true }),
            tone: resumen.netMinor >= 0 ? 'pos' : 'neg',
          },
          {
            label: 'Ingresos',
            value: money(resumen.inflowMinor, { compact: true }),
            tone: 'acc',
          },
        ]}
      />

      {resumen.stale && (
        <div className="fin-stale" role="status">
          ⚠ Último movimiento registrado hace {resumen.staleDays} días. Las cifras de
          flujo pueden estar desactualizadas.
        </div>
      )}

      <div className="fin-grid">
        {/* Main: los gráficos (flujo grande + barras). */}
        <div className="fin-main">
          <section className="fin-block">
            <h2 className="fin-h2">Flujo de caja (neto por mes)</h2>
            <CashflowChart serie={serie} />
          </section>

          <section className="fin-block">
            <h2 className="fin-h2">Por fuente de ingreso</h2>
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
            <h2 className="fin-h2">Gastos — top 5 del mes</h2>
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

          {/* Pipeline y discrepancias llegan con las ventas (Etapa 5). */}
          <p className="muted fin-soon">
            Pipeline abierto y discrepancias llegan en la Etapa 5, con las ventas.
          </p>
        </div>

        {/* Rail: metas, captura y fuentes (config). */}
        <div className="fin-rail">
          {areas.length === 0 ? (
            <p className="muted">
              Para registrar dinero, primero crea un área en{' '}
              <Link href="/areas" className="link">
                Áreas
              </Link>
              .
            </p>
          ) : (
            <>
              <section className="fin-block">
                <h2 className="fin-h2">Registrar movimiento</h2>
                <RegistrarMovimiento
                  areas={areaOpts}
                  sources={sourceOpts}
                  today={todayInTz(ctx.tz)}
                />
              </section>

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

              <Disclosure title="Fuentes de ingreso" count={sourceOpts.length}>
                <FuentesManager areas={areaOpts} sources={sourceOpts} />
              </Disclosure>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
