'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { QuickActions, type QuickData } from './quick-actions';

type Item = { href: Route; label: string; icon: React.ReactNode };

const I = {
  hoy: (
    <svg viewBox="0 0 24 24"><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
  ),
  finanzas: <svg viewBox="0 0 24 24"><path d="M4 19V5m5 14V9m5 10V7m5 12V4" /></svg>,
  calendario: (
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4m8-4v4" /></svg>
  ),
  docs: <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>,
  areas: (
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /></svg>
  ),
  chat: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  ajustes: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.9 7.9 0 0 0-1.7-1L14.8 3H9.2l-.5 2.5a7.9 7.9 0 0 0-1.7 1l-2.4-1-2 3.5L4.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.9 7.9 0 0 0 1.7 1l.5 2.5h5.6l.5-2.5a7.9 7.9 0 0 0 1.7-1l2.4 1 2-3.5z" /></svg>
  ),
};

const primary: Item[] = [
  { href: '/hoy', label: 'Hoy', icon: I.hoy },
  { href: '/finanzas', label: 'Finanzas', icon: I.finanzas },
  { href: '/calendario', label: 'Calendario', icon: I.calendario },
  { href: '/chat', label: 'Chat', icon: I.chat },
  { href: '/docs', label: 'Docs', icon: I.docs },
];
const config: Item[] = [
  { href: '/areas', label: 'Áreas', icon: I.areas },
  { href: '/ajustes', label: 'Ajustes', icon: I.ajustes },
];

export function Sidebar({ quick }: { quick?: QuickData }) {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(href + '/');

  const link = (it: Item) => (
    <Link key={it.href} href={it.href} className={`sb-link${isOn(it.href) ? ' sb-on' : ''}`}>
      <span className="sb-ic">{it.icon}</span>
      {it.label}
    </Link>
  );

  return (
    <aside className="app-sidebar">
      <div className="sb-brand">
        <span className="sb-mark">P</span>
        <b>Productividad</b>
      </div>
      <nav className="sb-nav">
        {primary.map(link)}
        <div className="sb-sec">Configuración</div>
        {config.map(link)}
      </nav>
      <div className="sb-foot">
        {quick && (
          <div className="sb-quick-wrap">
            <div className="sb-sec">Acceso rápido</div>
            <QuickActions {...quick} variant="sidebar" />
          </div>
        )}
        <form action={signOut}>
          <button type="submit" className="sb-out">
            Salir
          </button>
        </form>
      </div>
    </aside>
  );
}
