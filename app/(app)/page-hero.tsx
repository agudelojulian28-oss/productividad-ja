// Encabezado de página estilo command-center (mockup de escritorio, ADR-019):
// eyebrow + título grande + subtítulo, con KPIs/acciones a la derecha en escritorio.
// En móvil se apila; los KPIs bajan y envuelven. Reemplaza a `.page-title`.

export type Kpi = {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'acc';
  sub?: string; // segunda línea (ej. "de $24,2 M ingresos")
  spark?: number[]; // mini tendencia (sparkline)
  delta?: { pct: number; up: boolean }; // variación vs mes anterior (badge)
};

/** Sparkline estático (SVG): tendencia sutil dentro de la tarjeta KPI. */
function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 26;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map(
    (v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / range) * (h - 3) - 1.5] as const,
  );
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg
      className="kpi-spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" opacity="0.16" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  kpis,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  kpis?: Kpi[];
  actions?: React.ReactNode;
}) {
  const hasAside = (kpis && kpis.length > 0) || Boolean(actions);
  return (
    <header className="hero">
      <div className="hero-lead">
        {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
        <h1 className="hero-title">{title}</h1>
        {subtitle && <p className="hero-sub">{subtitle}</p>}
      </div>
      {hasAside && (
        <div className="hero-aside">
          {kpis?.map((k, i) => (
            <div key={i} className="kpi">
              <div className="kpi-k">{k.label}</div>
              <div className="kpi-vrow">
                <span className={`kpi-v${k.tone ? ` kpi-${k.tone}` : ''}`}>{k.value}</span>
                {k.delta && (
                  <span className={`kpi-delta ${k.delta.up ? 'up' : 'down'}`}>
                    {k.delta.up ? '▲' : '▼'} {Math.abs(k.delta.pct)}%
                  </span>
                )}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
              {k.spark && k.spark.length > 1 && <Spark data={k.spark} />}
            </div>
          ))}
          {actions}
        </div>
      )}
    </header>
  );
}
