import Link from 'next/link';
import { signOut } from '@/app/actions/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="shell-header">
        <span className="brand">Productividad</span>
        <form action={signOut}>
          <button className="linkbtn" type="submit">
            Salir
          </button>
        </form>
      </header>

      <main className="shell-main">{children}</main>

      <nav className="bottom-nav">
        <Link href="/hoy" className="nav-item nav-active">
          Hoy
        </Link>
      </nav>
    </div>
  );
}
