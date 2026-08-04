import Link from 'next/link';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { workRepo } from '@/adapters/supabase/work-repo';
import { resumenFinanciero, serieMensual } from '@/core/finance/queries';
import { money, todayInTz, dayLabelInTz } from '@/lib/format';
import { signedUrl } from '@/adapters/supabase/storage';
import { RealtimeRefresh } from '../realtime-refresh';
import { RegistrarMovimiento } from './registrar-movimiento';
import { CashflowChart } from './cashflow-chart';
import { MetasDinero } from './metas-dinero';
import { FinStats } from './fin-stats';
import { MovimientosRecientes, type MovRow } from './movimientos-recientes';
import { PageHero } from '../page-hero';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
  const { supabase, ctx } = await requireContext();
  const structure = structureRepo(supabase, ctx.userId);
  const finance = financeRepo(supabase, ctx.userId);
  const work = workRepo(supabase, ctx.userId);

  const [projects, cashflow, byProj, metas] = await Promise.all([
    work.listProjects(),
    finance.cashflowMonthly(),
    finance.byProject(),
    finance.moneyGoalsProgress(),
  ]);

  const resumen = resumenFinanciero(cashflow, ctx.tz);
  const serie = serieMensual(cashflow, 6);

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

          <FinStats
            inflowLabel={money(resumen.inflowMinor, { compact: true })}
            outflowLabel={money(resumen.outflowMinor, { compact: true })}
            fuentes={fuentes}
            gastos={gastos}
          />

          <section className="fin-block">
            <h2 className="fin-h2">Movimientos recientes</h2>
            <MovimientosRecientes rows={movRows} />
          </section>

          {/* Pipeline y discrepancias llegan con las ventas (Etapa 5). */}
          <p className="muted fin-soon">
            Pipeline abierto y discrepancias llegan en la Etapa 5, con las ventas.
          </p>
        </div>

        {/* Rail: captura y metas. */}
        <div className="fin-rail">
          {projectOpts.length === 0 ? (
            <p className="muted">
              Para registrar dinero, primero crea un proyecto en un{' '}
              <Link href="/areas" className="link">
                Área
              </Link>
              .
            </p>
          ) : (
            <>
              <section className="fin-block">
                <h2 className="fin-h2">Registrar movimiento</h2>
                <RegistrarMovimiento projects={projectOpts} today={todayInTz(ctx.tz)} />
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
