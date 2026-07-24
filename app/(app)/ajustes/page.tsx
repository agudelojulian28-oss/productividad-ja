import { requireContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { supabase, ctx } = await requireContext();
  const { google } = await searchParams;

  const { data } = await supabase
    .from('integrations')
    .select('provider')
    .eq('user_id', ctx.userId)
    .eq('provider', 'google')
    .maybeSingle();
  const connected = Boolean(data);

  return (
    <div className="page">
      <h1 className="page-title">Ajustes</h1>

      {google === 'ok' && (
        <p style={{ color: 'var(--positive)', marginBottom: 12 }}>
          Google Calendar conectado ✓
        </p>
      )}
      {google === 'error' && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          Hubo un error conectando Google. Intenta de nuevo.
        </p>
      )}
      {google === 'no_refresh' && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          Google no entregó el permiso necesario. Vuelve a intentarlo.
        </p>
      )}

      <div className="row-card">
        <div className="task-body">
          <span className="task-title">Google Calendar</span>
          <span className="task-meta">
            Tus tareas con hora aparecerán en tu agenda.
          </span>
        </div>
        {connected ? (
          <span className="pill pill-personal">Conectado</span>
        ) : (
          <a href="/auth/google" className="btn-primary" style={{ textDecoration: 'none' }}>
            Conectar
          </a>
        )}
      </div>
    </div>
  );
}
