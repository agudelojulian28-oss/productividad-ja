import Link from 'next/link';
import type { Route } from 'next';
import { SalIcon } from './icons';

// Sub-navegación del módulo: son PÁGINAS (enlazables, botón atrás predecible), no pestañas,
// así que va como <nav> con aria-current en vez de role=tablist.
const TABS: { href: Route; key: string; label: string; icon: React.ReactNode }[] = [
  { href: '/salud', key: 'resumen', label: 'Resumen', icon: SalIcon.salud },
  { href: '/salud/entrenamiento', key: 'entrenamiento', label: 'Entreno', icon: SalIcon.entrenamiento },
  { href: '/salud/dieta', key: 'dieta', label: 'Dieta', icon: SalIcon.dieta },
  { href: '/salud/cuerpo', key: 'cuerpo', label: 'Cuerpo', icon: SalIcon.cuerpo },
  { href: '/salud/espiritual', key: 'espiritual', label: 'Espiritual', icon: SalIcon.espiritual },
];

export function SaludNav({ active }: { active: string }) {
  return (
    <nav className="sl-nav" aria-label="Secciones de salud">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`sl-nav-link${t.key === active ? ' on' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          <span className="sl-nav-ico">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
