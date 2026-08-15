import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { resumenFinanciero, serieMensual } from '@/core/finance/queries';
import { money, todayInTz, dayLabelInTz } from '@/lib/format';
import { signedUrl } from '@/adapters/supabase/storage';
import { RealtimeRefresh } from '../realtime-refresh';
import { MovimientoLauncher } from './movimiento-launcher';
import { CashflowChart } from './cashflow-chart';
import { MetasDinero } from './metas-dinero';
import { FinStats } from './fin-stats';
import { MovimientosRecientes, type MovRow } from './movimientos-recientes';
import { GastosRecurrentes, type RecurRow } from './gastos-recurrentes';
import { PageHero } from '../page-hero';
import { EmptyState, emptyIcons } from '../empty-state';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const finance = financeRepo(supabase, ctx.userId);
  const work = workRepo(supabase, ctx.userId);

  const [projects, cashflow, byProj, metas, recurrentes] = await Promise.all([
    work.listProjects(),
    finance.cashflowMonthly(),
    finance.byProject(),
    finance.moneyGoalsProgress(),
    finance.listRecurringExpenses(),
  ]);
  const recurRows: RecurRow[] = recurrentes.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    amountMinor: r.amountMinor,
    category: r.category,
    description: r.description,
    frequency: r.frequency,
    nextDueOn: r.nextDueOn,
  }));

  const resumen = resumenFinanciero(cashflow, ctx.tz);
  const serie = serieMensual(cashflow, 6);

  // Variación % vs el mes anterior (badge en KPIs). Solo si el mes previo > 0.
  const cur = serie[serie.length - 1];
  const prev = serie.length >= 2 ? serie[serie.length - 2] : undefined;
  const pctDelta = (c: number, p: number | undefined) =>
    p && p > 0 ? { pct: Math.round(((c - p) / p) * 100), up: c >= p } : undefined;
  const balanceDelta = cur ? pctDelta(cur.netMinor, prev?.netMinor) : undefined;
  const ingresosDelta = cur ? pctDelta(cur.inflowMinor, prev?.inflowMinor) : undefined;

  // Ingresos y gastos por proyecto del mes en curso (ADR-026).
  const projName = new Map(projects.map((p) => [p.id, p.title] as const));
  const currentMonth = `${todayInTz(ctx.tz).slice(0, 7)}-01`;
  const thisMonth = byProj.filter((r) => r.month === currentMonth);
  const fuentes = thisMonth
    .filter((r) => r.inflowMinor > 0)
    .sort((a, b) => b.inflowMinor - a.inflowMinor)
    .map((r) => ({
      label: projName.get(r.projectId) ?? '—',
      value: r.inflowMinor,
      valueLabel: money(r.inflowMinor),
    }));
  const gastos = thisMonth
    .filter((r) => r.outflowMinor > 0)
    .sort((a, b) => b.outflowMinor - a.outflowMinor)
    .map((r) => ({
      label: projName.get(r.projectId) ?? '—',
      value: r.outflowMinor,
      valueLabel: money(r.outflowMinor),
    }));

  // Movimientos recientes con su comprobante (si tiene). Una consulta para todos.
  const recientes = await finance.listRecentTransactions(20);
  const receipts = await structure.listAttachmentsForTransactions(recientes.map((t) => t.id));
  const receiptPath = new Map<string, string>();
  for (const a of receipts) {
    if (a.transactionId && !receiptPath.has(a.transactionId)) {
      receiptPath.set(a.transactionId, a.storagePath);
    }
  }
  const receiptUrl = new Map<string, string | null>();
  await Promise.all(
    [...receiptPath].map(async ([txId, path]) => {
      receiptUrl.set(txId, await signedUrl(supabase, path));
    }),
  );
  const movRows: MovRow[] = recientes.map((t) => ({
    id: t.id,
    direction: t.direction,
    baseAmountMinor: t.baseAmountMinor,
    occurredOn: dayLabelInTz(`${t.occurredOn}T12:00:00Z`, ctx.tz),
    title: t.description || t.category || (t.direction === 'in' ? 'Ingreso' : 'Gasto'),
    areaName: (t.projectId ? projName.get(t.projectId) : undefined) ?? '—',
    receiptUrl: receiptUrl.get(t.id) ?? null,
    projectId: t.projectId,
    category: t.category,
    description: t.description,
    amountMinor: t.amountMinor,
    currency: t.currency,
    fxRate: t.fxRate,
    occurredOnRaw: t.occurredOn,
  }));

  // Solo proyectos con área pueden recibir dinero (la transacción exige área).
  const projectOpts = projects
    .filter((p) => p.areaId)
    .map((p) => ({ id: p.id, title: p.title, areaId: p.areaId as string }));

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
            label: 'Balance del mes',
            value: money(resumen.netMinor, { compact: true }),
            tone: resumen.netMinor >= 0 ? 'pos' : 'neg',
            sub: `${resumen.movements} ${resumen.movements === 1 ? 'movimiento' : 'movimientos'}`,
            spark: serie.map((s) => s.netMinor),
            delta: balanceDelta,
          },
          {
            label: 'Ingresos',
            value: money(resumen.inflowMinor, { compact: true }),
            tone: 'acc',
            spark: serie.map((s) => s.inflowMinor),
            delta: ingresosDelta,
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
            <h2 className="fin-h2">Balance de caja</h2>
            <CashflowChart
              serie={serie}
              porProyecto={fuentes.map((f) => ({ label: f.label, value: f.value }))}
              balanceMinor={resumen.netMinor}
            />
          </section>

          <FinStats
            inflowLabel={money(resumen.inflowMinor, { compact: true })}
            outflowLabel={money(resumen.outflowMinor, { compact: true })}
            fuentes={fuentes}
            gastos={gastos}
          />

          <section className="fin-block">
            <h2 className="fin-h2">Movimientos recientes</h2>
            <MovimientosRecientes rows={movRows} today={todayInTz(ctx.tz)} projects={projectOpts} />
          </section>

          <section className="fin-block">
            <h2 className="fin-h2">Gastos recurrentes</h2>
            <GastosRecurrentes
              projects={projectOpts}
              recurrentes={recurRows}
              today={todayInTz(ctx.tz)}
            />
          </section>

          {/* Pipeline y discrepancias llegan con las ventas (Etapa 5). */}
          <p className="muted fin-soon">
            Pipeline abierto y discrepancias llegan en la Etapa 5, con las ventas.
          </p>
        </div>

        {/* Rail: captura y metas. */}
        <div className="fin-rail">
          {projectOpts.length === 0 ? (
            <EmptyState
              icon={emptyIcons.money}
              title="Aún no puedes registrar dinero"
              hint="El dinero se atribuye a un proyecto. Crea un proyecto dentro de un Área para empezar."
              action={
                <Link href="/areas" className="btn-primary launch-btn">
                  Ir a Áreas
                </Link>
              }
            />
          ) : (
            <>
              <section className="fin-block fin-capture">
                <MovimientoLauncher projects={projectOpts} today={todayInTz(ctx.tz)} />
              </section>

              <section className="fin-block">
                <h2 className="fin-h2">Metas de dinero</h2>
                <MetasDinero
                  projects={projectOpts}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
