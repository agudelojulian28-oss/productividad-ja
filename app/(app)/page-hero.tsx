// Encabezado de página estilo command-center (mockup de escritorio, ADR-019):
// eyebrow + título grande + subtítulo, con KPIs/acciones a la derecha en escritorio.
// En móvil se apila; los KPIs bajan y envuelven. Reemplaza a `.page-title`.

export type Kpi = {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'acc';
};

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
              <div className={`kpi-v${k.tone ? ` kpi-${k.tone}` : ''}`}>{k.value}</div>
            </div>
          ))}
          {actions}
        </div>
      )}
    </header>
  );
}
