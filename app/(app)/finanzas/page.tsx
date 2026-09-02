import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { resumenFinanciero, serieMensual } from '@/core/finance/queries';
import { recurringMonthly, reporteFinanciero } from '@/core/finance/analisis';
import { BalanceAnual } from './balance-anual';
import { ReporteFinancieroCard } from './reporte-financiero';
import { money, todayInTz, dayLabelInTz } from '@/lib/format';
import { getTrm } from '@/lib/trm';
import { signedUrl } from '@/adapters/supabase/storage';
import { RealtimeRefresh } from '../realtime-refresh';
import { MovimientoLauncher } from './movimiento-launcher';
import { ReservasTiles } from './reservas-tiles';
import { getReservasAction } from '@/app/actions/finance';
import { CashflowChart } from './cashflow-chart';
import { MetasDinero } from './metas-dinero';
import { FinStats } from './fin-stats';
import { MovimientosRecientes, type MovRow } from './movimientos-recientes';
import { Recurrentes, type RecurRow } from './gastos-recurrentes';
import { TagsSection } from './tags-section';
import { PageHero } from '../page-hero';
import { EmptyState, emptyIcons } from '../empty-state';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const finance = financeRepo(supabase, ctx.userId);
  const work = workRepo(supabase, ctx.userId);

  const [projects, cashflow, byProj, metas, recurrentes, tags, trm] = await Promise.all([
    work.listProjects(),
    finance.cashflowMonthly(),
    finance.byProject(),
    finance.moneyGoalsProgress(),
    finance.listRecurringExpenses(),
    finance.listTags(),
    getTrm(),
  ]);
  // Etiquetas de cada recurrente (una consulta para todas).
  const recTags = await finance.listRecurringTags(recurrentes.map((r) => r.id));
  const tagsByRec = new Map<string, string[]>();
  for (const { recurringId, tagId } of recTags) {
    const cur = tagsByRec.get(recurringId) ?? [];
    cur.push(tagId);
    tagsByRec.set(recurringId, cur);
  }
  const recurRows: RecurRow[] = recurrentes.map((r) => ({
    id: r.id,
    direction: r.direction,
    projectId: r.projectId,
    amountMinor: r.amountMinor,
    category: r.category,
    description: r.description,
    frequency: r.frequency,
    nextDueOn: r.nextDueOn,
    tagIds: tagsByRec.get(r.id) ?? [],
  }));
  const gastosRecur = recurRows.filter((r) => r.direction === 'out');
  const ingresosRecur = recurRows.filter((r) => r.direction === 'in');

  const resumen = resumenFinanciero(cashflow, ctx.tz);
  const serie = serieMensual(cashflow, 6);
  // Serie completa (todos los meses con datos) para el resumen anual del rail.
  const serieCompleta = serieMensual(cashflow, 600);
  const reservas = await getReservasAction();

  // Recurrentes normalizados a mensual (combinado de ambos) + informe de salud/proyección.
  const recurItems = recurRows.map((r) => ({
    direction: r.direction,
    projectId: r.projectId,
    amountMinor: r.amountMinor,
    frequency: r.frequency,
  }));
  const recurringCombo = recurringMonthly(recurItems);
  const reporte = reporteFinanciero({
    serie: serieCompleta,
    recurrentes: recurItems,
    emergencyBalanceMinor: reservas.emergencia.balanceMinor,
    today: todayInTz(ctx.tz),
  });

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
  // Gastos por proyecto del mes (para la dona en modo "Gastos").
  const gastosProy = thisMonth
    .filter((r) => r.outflowMinor > 0)
    .sort((a, b) => b.outflowMinor - a.outflowMinor)
    .map((r) => ({ label: projName.get(r.projectId) ?? '—', value: r.outflowMinor }));
  // Filas por proyecto y mes (todas) para el bloque de Ingresos/Gastos/Balance filtrable.
  const statRows = byProj.map((r) => ({
    projectId: r.projectId,
    label: projName.get(r.projectId) ?? '—',
    month: r.month, // 'YYYY-MM-01'
    inflow: r.inflowMinor,
    outflow: r.outflowMinor,
    movements: r.movements,
  }));

  // Movimientos de los últimos ~6 meses para las montañitas por proyecto (semanas o meses).
  const trendFrom = (() => {
    const d = new Date(`${todayInTz(ctx.tz)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 190);
    return d.toISOString().slice(0, 10);
  })();
  const trendTxs = await finance.listTransactions({ from: trendFrom, limit: 1000 });
  const trendData = trendTxs
    .filter((t) => t.projectId)
    .map((t) => ({
      projectId: t.projectId as string,
      dir: t.direction,
      amount: t.baseAmountMinor,
      date: t.occurredOn,
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
  const txTags = await finance.listTransactionTags(recientes.map((t) => t.id));
  const tagsByTx = new Map<string, string[]>();
  for (const { transactionId, tagId } of txTags) {
    const cur = tagsByTx.get(transactionId) ?? [];
    cur.push(tagId);
    tagsByTx.set(transactionId, cur);
  }
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
    tagIds: tagsByTx.get(t.id) ?? [],
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
        actions={<ReservasTiles data={reservas} today={todayInTz(ctx.tz)} />}
      />

      {resumen.stale && (
        <div className="fin-stale" role="status">
          ⚠ Último movimiento registrado hace {resumen.staleDays} días. Las cifras de
          flujo pueden estar desactualizadas.
        </div>
      )}

      {/* En móvil el botón de registrar va arriba, justo bajo el balance. En
          escritorio este se oculta (se usa el del rail). */}
      {projectOpts.length > 0 && (
        <div className="fin-capture-top">
          <MovimientoLauncher projects={projectOpts} today={todayInTz(ctx.tz)} tags={tags} trm={trm.value} />
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
              gastosPorProyecto={gastosProy}
              balanceMinor={resumen.netMinor}
            />
          </section>

          <FinStats
            rows={statRows}
            monthKey={resumen.monthKey}
            trendTx={trendData}
            recent={movRows}
            today={todayInTz(ctx.tz)}
          />

          <section className="fin-block">
            <h2 className="fin-h2">Movimientos recientes</h2>
            <MovimientosRecientes
              rows={movRows}
              today={todayInTz(ctx.tz)}
              projects={projectOpts}
              tags={tags}
            />
          </section>

          <section className="fin-block">
            <h2 className="fin-h2">Gastos recurrentes</h2>
            <Recurrentes
              direction="out"
              projects={projectOpts}
              recurrentes={gastosRecur}
              today={todayInTz(ctx.tz)}
              tags={tags}
            />
          </section>

          <section className="fin-block">
            <h2 className="fin-h2">Ingresos recurrentes</h2>
            <Recurrentes
              direction="in"
              projects={projectOpts}
              recurrentes={ingresosRecur}
              today={todayInTz(ctx.tz)}
              tags={tags}
            />
          </section>

          {(gastosRecur.length > 0 || ingresosRecur.length > 0) && (
            <section className="fin-block">
              <h2 className="fin-h2">Resumen recurrente / mes</h2>
              <div className="recur-combo" role="group" aria-label="Total recurrente mensual">
                <div className="recur-combo-cell">
                  <span className="recur-combo-k">Ingresos / mes</span>
                  <span className="recur-combo-v fin-pos">+{money(recurringCombo.inMinor, { compact: true })}</span>
                </div>
                <div className="recur-combo-cell">
                  <span className="recur-combo-k">Gastos / mes</span>
                  <span className="recur-combo-v fin-neg">−{money(recurringCombo.outMinor, { compact: true })}</span>
                </div>
                <div className="recur-combo-cell recur-combo-net">
                  <span className="recur-combo-k">Neto recurrente / mes</span>
                  <span className={`recur-combo-v ${recurringCombo.netMinor >= 0 ? 'fin-pos' : 'fin-neg'}`}>
                    {recurringCombo.netMinor >= 0 ? '+' : '−'}
                    {money(Math.abs(recurringCombo.netMinor), { compact: true })}
                  </span>
                </div>
              </div>
            </section>
          )}

          <section className="fin-block">
            <h2 className="fin-h2">Etiquetas</h2>
            <TagsSection
              tags={tags}
              projects={projectOpts.map((p) => ({ id: p.id, title: p.title }))}
            />
          </section>

          <section className="fin-block">
            <h2 className="fin-h2">Sostenimiento</h2>
            <p className="muted" style={{ marginBottom: 10 }}>
              Costos de operar la app (y los que podrían venir), con avisos de recarga.
            </p>
            <Link href="/finanzas/sostenimiento" className="btn-ghost meta-add">
              Ver sostenimiento →
            </Link>
          </section>

          {/* Pipeline y discrepancias llegan con las ventas (Etapa 5). */}
          <p className="muted fin-soon">
            Pipeline abierto y discrepancias llegan en la Etapa 5, con las ventas.
          </p>

          <section className="fin-block">
            <h2 className="fin-h2">Informe financiero</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Qué tan sanas están tus finanzas y su proyección a los próximos meses.
            </p>
            <ReporteFinancieroCard report={reporte} />
          </section>
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
                <MovimientoLauncher projects={projectOpts} today={todayInTz(ctx.tz)} tags={tags} trm={trm.value} />
              </section>

              <section className="fin-block">
                <h2 className="fin-h2">Balance del año</h2>
                <BalanceAnual serie={serieCompleta} today={todayInTz(ctx.tz)} />
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
