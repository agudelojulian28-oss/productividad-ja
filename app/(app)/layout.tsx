import { signOut } from '@/app/actions/auth';
import { BottomNav } from './bottom-nav';

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

      <BottomNav />
    </div>
  );
}
