'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/hoy', label: 'Hoy' },
  { href: '/areas', label: 'Áreas' },
  { href: '/ajustes', label: 'Ajustes' },
] as const;

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + '/');
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`nav-item${active ? ' nav-active' : ''}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
