import { money } from '@/lib/format';
import type { ReporteFinanciero } from '@/core/finance/analisis';
import { MiniMountain } from './mini-mountain';

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mesCorto = (ym: string) => MES[Number(ym.slice(5, 7)) - 1] ?? ym;

const VERDICT = {
  sana: { label: 'Sana', tone: 'pos', hint: 'Tus finanzas están en buena forma.' },
  atencion: { label: 'Atención', tone: 'acc', hint: 'Hay señales que conviene vigilar.' },
  riesgo: { label: 'En riesgo', tone: 'neg', hint: 'Conviene ajustar pronto.' },
} as const;
const TREND = { mejora: '▲ mejorando', estable: '→ estable', baja: '▼ bajando' } as const;

const pctStr = (v: number | null) => (v === null ? '—' : `${v}%`);

/** Informe de salud financiera + proyección (lee el análisis puro del core). */
export function ReporteFinancieroCard({ report }: { report: ReporteFinanciero }) {
  const v = VERDICT[report.verdict];

  if (report.monthsUsed === 0) {
    return (
      <p className="muted">
        Aún no hay suficientes movimientos para un informe. Registra ingresos y gastos y aquí verás
        qué tan sanas están tus finanzas y su proyección.
      </p>
    );
  }

  const bullets: string[] = [];
  if (report.savingsRatePct !== null) {
    bullets.push(
      report.savingsRatePct >= 20
        ? `Ahorras el ${report.savingsRatePct}% de lo que entra: excelente ritmo.`
        : report.savingsRatePct >= 0
          ? `Ahorras el ${report.savingsRatePct}% de tus ingresos; apunta al 20%.`
          : `Estás gastando más de lo que entra (${report.savingsRatePct}%). Revisa gastos.`,
    );
  }
  if (report.emergencyCoverageMonths !== null) {
    bullets.push(
      report.emergencyCoverageMonths >= 6
        ? `Tu fondo de emergencia cubre ${report.emergencyCoverageMonths} meses de gastos. Ideal.`
        : `Tu fondo cubre ${report.emergencyCoverageMonths} meses de gastos; la meta sana son 6.`,
    );
  } else {
    bullets.push('Aún no tienes fondo de emergencia con qué medir cobertura.');
  }
  if (report.fixedCostRatioPct !== null) {
    bullets.push(
      report.fixedCostRatioPct <= 50
        ? `Tus costos fijos son el ${report.fixedCostRatioPct}% de tus ingresos: margen cómodo.`
        : `Tus costos fijos ya son el ${report.fixedCostRatioPct}% de tus ingresos; ojo con comprometer más.`,
    );
  }

  const proj = report.projection;
  const last = proj[proj.length - 1];

  return (
    <div className="rep">
      <div className="rep-head">
        <div className="rep-verdict">
          <span className={`rep-badge rep-${v.tone}`}>{v.label}</span>
          <span className="rep-score">
            {report.score}<span className="rep-score-max">/100</span>
          </span>
          <span className="rep-trend">{TREND[report.trend]}</span>
        </div>
        <p className="rep-hint">
          {v.hint} Basado en los últimos {report.monthsUsed} {report.monthsUsed === 1 ? 'mes' : 'meses'} con movimientos.
        </p>
      </div>

      <div className="rep-stats">
        <div className="rep-stat">
          <span className="rep-stat-k">Neto mensual prom.</span>
          <span className={`rep-stat-v ${report.avgNetMinor >= 0 ? 'pos' : 'neg'}`}>
            {money(report.avgNetMinor, { compact: true })}
          </span>
        </div>
        <div className="rep-stat">
          <span className="rep-stat-k">Tasa de ahorro</span>
          <span className="rep-stat-v">{pctStr(report.savingsRatePct)}</span>
        </div>
        <div className="rep-stat">
          <span className="rep-stat-k">Costos fijos / ingresos</span>
          <span className="rep-stat-v">{pctStr(report.fixedCostRatioPct)}</span>
        </div>
        <div className="rep-stat">
          <span className="rep-stat-k">Fondo de emergencia</span>
          <span className="rep-stat-v">
            {report.emergencyCoverageMonths === null ? '—' : `${report.emergencyCoverageMonths} meses`}
          </span>
        </div>
      </div>

      <div className="rep-proj">
        <div className="rep-proj-head">
          <h3 className="rep-proj-title">Proyección · próximos {proj.length} meses</h3>
          <span className="muted rep-proj-note">a este ritmo (neto promedio)</span>
        </div>
        <MiniMountain
          labels={proj.map((p) => mesCorto(p.month))}
          values={proj.map((p) => p.cumulativeMinor)}
          tone={report.avgNetMinor >= 0 ? 'accent' : 'muted'}
          height={72}
          showZero
        />
        <div className="rep-proj-table">
          {proj.map((p) => (
            <div key={p.month} className="rep-proj-row">
              <span>{mesCorto(p.month)}</span>
              <span className={p.netMinor >= 0 ? 'pos' : 'neg'}>
                {p.netMinor >= 0 ? '+' : ''}
                {money(p.netMinor, { compact: true })}
              </span>
              <span className={`rep-proj-cum ${p.cumulativeMinor >= 0 ? 'pos' : 'neg'}`}>
                {money(p.cumulativeMinor, { compact: true })}
              </span>
            </div>
          ))}
        </div>
        {last && (
          <p className="rep-proj-foot">
            Si sigues igual, en {proj.length} meses habrás {last.cumulativeMinor >= 0 ? 'acumulado' : 'perdido'}{' '}
            <strong>{money(Math.abs(last.cumulativeMinor), { compact: true })}</strong>.
          </p>
        )}
      </div>

      <ul className="rep-bullets">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
