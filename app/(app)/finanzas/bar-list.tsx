// Barras horizontales para magnitudes por entidad (por fuente, gastos por categoría).
// dataviz: una sola serie → un solo tono; etiqueta directa; sin arcoíris; tabular-nums.

export type BarItem = {
  label: string;
  value: number;
  valueLabel: string;
  delta?: { text: string; up: boolean | null } | null;
};

export function BarList({
  items,
  tone = 'accent',
}: {
  items: BarItem[];
  tone?: 'accent' | 'muted';
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="barlist">
      {items.map((it, i) => (
        <div key={i} className="barlist-row">
          <div className="barlist-head">
            <span className="barlist-label">{it.label}</span>
            <span className="barlist-val">
              {it.valueLabel}
              {it.delta && it.delta.up !== null && (
                <em className={it.delta.up ? 'fin-pos' : 'fin-neg'}>
                  {it.delta.up ? ' ▲' : ' ▼'} {it.delta.text}
                </em>
              )}
            </span>
          </div>
          <div className="barlist-track">
            <div
              className={`barlist-fill barlist-${tone}`}
              style={{ width: `${Math.max(2, Math.round((it.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
