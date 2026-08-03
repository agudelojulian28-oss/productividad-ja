// Tarjeta expandible para divulgación progresiva en móvil.
// <details> nativo: accesible, teclado, sin JS ni dependencia de hover.
// En escritorio (≥1024px) el CSS fuerza el contenido visible y oculta el resumen.

export function Disclosure({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="disc" open={defaultOpen}>
      <summary className="disc-sum">
        <span className="disc-title">{title}</span>
        {count !== undefined && <span className="disc-count">{count}</span>}
        <span className="disc-chev" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="disc-body">{children}</div>
    </details>
  );
}
