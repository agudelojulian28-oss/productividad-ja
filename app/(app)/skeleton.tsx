// Skeletons de carga (App Router `loading.tsx`). Se muestran al instante al navegar
// mientras el server component resuelve, dando sensación de velocidad. Puro CSS,
// sin estado; respetan reduced-motion (el shimmer se apaga en globals.css).

/** Bloque base con shimmer. `w`/`h` aceptan cualquier unidad CSS. */
export function Skel({
  w = '100%',
  h = 14,
  radius = 8,
  style,
}: {
  w?: string | number;
  h?: string | number;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skel"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** Encabezado de página (eyebrow + título + subtítulo + KPIs). */
export function HeroSkeleton() {
  return (
    <div className="hero skel-hero">
      <div className="hero-lead">
        <Skel w={90} h={12} />
        <Skel w={180} h={28} style={{ marginTop: 8 }} />
        <Skel w={260} h={14} style={{ marginTop: 10 }} />
      </div>
      <div className="hero-aside">
        <Skel w={116} h={62} radius={14} />
        <Skel w={116} h={62} radius={14} />
      </div>
    </div>
  );
}

/** Lista de tarjetas (filas) genérica. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skel-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel-card">
          <Skel w="55%" h={15} />
          <Skel w="30%" h={12} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

/** Pantalla completa: hero + lista. Base para la mayoría de `loading.tsx`. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="page">
      <HeroSkeleton />
      <ListSkeleton rows={rows} />
    </div>
  );
}
