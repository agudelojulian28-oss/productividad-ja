'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  {
    href: '/hoy',
    label: 'Hoy',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: '/finanzas',
    label: 'Finanzas',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 19V5m5 14V9m5 10V7m5 12V4" />
      </svg>
    ),
  },
  {
    href: '/calendario',
    label: 'Calendario',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4m8-4v4" />
      </svg>
    ),
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 5h16v11H8l-4 4z" />
      </svg>
    ),
  },
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
            aria-label={it.label}
            title={it.label}
          >
            <span className="nav-ic">{it.icon}</span>
          </Link>
        );
      })}
    </nav>
  );
}
