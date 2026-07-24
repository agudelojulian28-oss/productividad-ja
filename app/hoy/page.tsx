import { createClient } from '@/adapters/supabase/server';

export default async function HoyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600 }}>Hoy</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
        Sesión activa: {user?.email ?? '—'}
      </p>
      <p style={{ color: 'var(--text-subtle)', marginTop: 24, fontSize: 14 }}>
        Etapa 1 en construcción: aquí irán tu agenda y tus pendientes.
      </p>
    </main>
  );
}
