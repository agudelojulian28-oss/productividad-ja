import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { BottomNav } from './bottom-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="shell-header">
        <span className="brand">Productividad</span>
        <div className="shell-header-actions">
          <Link href="/ajustes" className="linkbtn">
            Ajustes
          </Link>
          <form action={signOut}>
            <button className="linkbtn" type="submit">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="shell-main">{children}</main>

      <BottomNav />
    </div>
  );
}
