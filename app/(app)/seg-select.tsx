'use client';

/**
 * Control segmentado reutilizable (estilo pestañas del gráfico): para elegir
 * entre 2–5 opciones excluyentes, en vez de un <select> desplegable. Mismo valor
 * y semántica que un select; solo cambia la interacción.
 */
export function SegSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`seg-btn${value === o.value ? ' seg-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
