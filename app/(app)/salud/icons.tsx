// Íconos SVG del módulo Salud (trazo, heredan currentColor). Sin emoji como ícono.
import type { HealthSection } from '@/core/health/ports';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const SalIcon = {
  salud: (
    <svg {...base}>
      <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
    </svg>
  ),
  entrenamiento: (
    <svg {...base}>
      <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
    </svg>
  ),
  dieta: (
    <svg {...base}>
      <path d="M12 21c-4.4 0-8-3.6-8-8 0-3 2-5 4.5-5 1.4 0 2.6.6 3.5 1.5.9-.9 2.1-1.5 3.5-1.5C18 8 20 10 20 13c0 4.4-3.6 8-8 8z" />
      <path d="M12 9.5V5c0-1.1.9-2 2-2" />
    </svg>
  ),
  cuerpo: (
    <svg {...base}>
      <rect x="7" y="3" width="10" height="5" rx="1.5" />
      <path d="M8 8h8v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
      <path d="M10 13h4" />
    </svg>
  ),
  espiritual: (
    <svg {...base}>
      <path d="M12 3v18M7 8h10" />
    </svg>
  ),
  racha: (
    <svg {...base}>
      <path d="M12 22c4 0 7-2.9 7-7 0-4-3-6-4-10-1 2-3 3-3 3s-1-2-.5-5C8 5 5 9 5 15c0 4.1 3 7 7 7z" />
    </svg>
  ),
  check: (
    <svg {...base} strokeWidth={2.6}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  reloj: (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  carrito: (
    <svg {...base}>
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
      <circle cx="10" cy="20.5" r="1" />
      <circle cx="18" cy="20.5" r="1" />
    </svg>
  ),
} as const;

export function sectionIcon(s: HealthSection) {
  return SalIcon[s];
}
