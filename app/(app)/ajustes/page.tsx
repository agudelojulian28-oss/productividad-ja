import { requireContext } from '@/lib/auth';
import { getGoogleTokenCipher } from '@/adapters/supabase/integrations';
import { decryptToken } from '@/lib/crypto';
import { refreshAccessToken } from '@/adapters/google/oauth';
import { PageHero } from '../page-hero';
import { PasskeyManager } from './passkey-manager';

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

  // "Conectado" solo dice que existe la fila. Verifica que el token siga vivo:
  // un refresh_token revocado/caducado da invalid_grant y el calendario deja de
  // sincronizar en silencio. Si falla, la conexión está rota y hay que reconectar.
  let googleBroken = false;
  if (connected) {
    try {
      const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
      if (!cipher) googleBroken = true;
      else await refreshAccessToken(decryptToken(cipher));
    } catch {
      googleBroken = true;
    }
  }

  const { data: credsRaw } = await supabase
    .from('webauthn_credentials')
    .select('credential_id,device_label,created_at')
    .order('created_at', { ascending: false });
  const credentials = (
    (credsRaw as { credential_id: string; device_label: string | null; created_at: string }[] | null) ??
    []
  ).map((c) => ({ credentialId: c.credential_id, label: c.device_label, createdAt: c.created_at }));

  return (
    <div className="page">
      <PageHero
        eyebrow="Cuenta"
        title="Ajustes"
        subtitle="Conexiones y seguridad. Estas acciones viven solo en la app, no en el agente."
      />

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
            {!connected
              ? 'Conéctalo para ver tu agenda y detectar choques.'
              : googleBroken
                ? 'La conexión caducó. Reconéctala para volver a ver tu agenda.'
                : 'Conectado. Tus tareas con hora aparecen en tu agenda.'}
          </span>
        </div>
        {connected && !googleBroken ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pill pill-personal">Conectado</span>
            <a href="/auth/google" className="linkbtn" style={{ textDecoration: 'none' }}>
              Reconectar
            </a>
          </div>
        ) : (
          <a href="/auth/google" className="btn-primary" style={{ textDecoration: 'none' }}>
            {connected ? 'Reconectar' : 'Conectar'}
          </a>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <PasskeyManager credentials={credentials} />
      </div>
    </div>
  );
}
