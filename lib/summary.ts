import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import { workRepo } from '@/adapters/supabase/work-repo';
import { financeRepo } from '@/adapters/supabase/finance-repo';
import { getDayEvents, getRangeEvents } from '@/lib/calendar-sync';
import { resumenFinanciero, porFuente, topGastos } from '@/core/finance/queries';
import { detectarChoques } from '@/lib/agenda';
import { money, todayInTz, dateInTz, timeInTz, dayLabelInTz } from '@/lib/format';

export type SummaryKind = 'daily' | 'weekly';

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Construye el texto del resumen (determinista, sin LLM). Lee las mismas fuentes que
 *  el panel y la agenda, así que nunca discrepa con lo que ve Julián en la app. */
export async function buildSummary(
  supabase: ServerSupabase,
  ctx: ActorContext,
  kind: SummaryKind,
): Promise<string> {
  const repo = workRepo(supabase, ctx.userId);
  const fin = financeRepo(supabase, ctx.userId);
  const today = todayInTz(ctx.tz);

  const [tasks, cashflow, recurrentes] = await Promise.all([
    repo.listTasks({ status: 'pending' }),
    fin.cashflowMonthly(),
    fin.listRecurringExpenses(),
  ]);
  const recurVencidos = recurrentes.filter((r) => r.nextDueOn <= today);

  let vencidas = 0;
  let paraHoy = 0;
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const d = dateInTz(t.dueAt, ctx.tz);
    if (d < today) vencidas++;
    else if (d === today) paraHoy++;
  }

  const r = resumenFinanciero(cashflow, ctx.tz);
  const lineas: string[] = [];

  if (kind === 'daily') {
    const eventos = (await getDayEvents(supabase, ctx, today))
      .filter((e) => !e.allDay && e.start)
      .sort((a, b) => (a.start! < b.start! ? -1 : 1));
    lineas.push(`☀️ Buenos días. Hoy es ${dayLabelInTz(`${today}T12:00:00Z`, ctx.tz)}.`);
    lineas.push('');
    if (eventos.length === 0) lineas.push('📅 Sin eventos agendados hoy.');
    else {
      lineas.push(`📅 Agenda (${eventos.length}):`);
      for (const e of eventos.slice(0, 8)) {
        lineas.push(`  • ${timeInTz(e.start!, ctx.tz)} ${e.summary}`);
      }
    }
    lineas.push(`✅ Tareas: ${vencidas} vencidas · ${paraHoy} para hoy`);
    lineas.push(`💰 Mes: entró ${money(r.inflowMinor)} · salió ${money(r.outflowMinor)} · neto ${money(r.netMinor)}`);
    if (recurVencidos.length > 0) {
      lineas.push(
        `🔁 ${recurVencidos.length} gasto(s) recurrente(s) por confirmar: ` +
          recurVencidos
            .slice(0, 5)
            .map((x) => `${x.description || x.category || 'gasto'} (${money(x.amountMinor)})`)
            .join(', ') +
          '. Ábrelos en la app para confirmar.',
      );
    }
    const choques = detectarChoques(await getDayEvents(supabase, ctx, today));
    if (choques.length > 0) lineas.push(`⚠️ ${choques.length} choque(s) de agenda hoy.`);
  } else {
    // Semanal: la semana que viene + algo que quizá no sabías.
    const finRango = addDaysYmd(today, 7);
    const eventosSemana = await getRangeEvents(supabase, ctx, today, finRango);
    const choques = detectarChoques(eventosSemana);
    const fuentes = porFuente(await fin.bySource());
    const mayorGasto = topGastos(await fin.expensesByCategory(), ctx.tz, 1)[0];
    const creciendo = fuentes
      .filter((f) => f.lastMonthMinor > 0 && f.thisMonthMinor > f.lastMonthMinor)
      .sort((a, b) => b.thisMonthMinor / b.lastMonthMinor - a.thisMonthMinor / a.lastMonthMinor)[0];

    lineas.push('🗓️ Resumen de la semana.');
    lineas.push('');
    lineas.push(`💰 Mes: entró ${money(r.inflowMinor)} · salió ${money(r.outflowMinor)} · neto ${money(r.netMinor)}`);
    if (creciendo) {
      const pct = Math.round(
        ((creciendo.thisMonthMinor - creciendo.lastMonthMinor) / creciendo.lastMonthMinor) * 100,
      );
      lineas.push(`📈 Fuente que más creció: ${creciendo.name} (+${pct}% vs mes anterior).`);
    }
    if (mayorGasto) lineas.push(`💸 Mayor gasto del mes: ${mayorGasto.category} (${money(mayorGasto.amountMinor)}).`);
    lineas.push(`📅 Próxima semana: ${eventosSemana.length} evento(s).`);
    if (choques.length > 0) lineas.push(`⚠️ ${choques.length} choque(s) de agenda por venir.`);
    lineas.push(`✅ Pendientes: ${vencidas} vencidas.`);
    if (r.stale) lineas.push(`🕐 Sin registrar movimientos hace ${r.staleDays} días.`);
  }

  return lineas.join('\n');
}
