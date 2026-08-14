import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { todayInTz } from '@/lib/format';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import { RecurrentesGate } from './recurrentes-gate';
import type { QuickData } from './quick-actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Datos ligeros para el acceso rápido del sidebar (una consulta de proyectos).
  const { supabase, ctx } = await requireContext();
  const projects = await workRepo(supabase, ctx.userId).listProjects();
  const quick: QuickData = {
    projects: projects.map((p) => ({ id: p.id, title: p.title })),
    goalsByProject: {},
    movProjects: projects
      .filter((p) => p.areaId)
      .map((p) => ({ id: p.id, title: p.title, areaId: p.areaId as string })),
    today: todayInTz(ctx.tz),
  };

  return (
    <div className="app">
      <RecurrentesGate />
      <Sidebar quick={quick} />
      <div className="shell">
      <header className="shell-header">
        <span className="brand">Productividad</span>
        <div className="shell-header-actions">
          <Link href="/docs" className="linkbtn">
            Docs
          </Link>
          <Link href="/areas" className="linkbtn">
            Áreas
          </Link>
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
    </div>
  );
}
