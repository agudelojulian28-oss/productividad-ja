'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/adapters/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : error.message,
      );
      return;
    }
    // La sesión queda en cookies (@supabase/ssr). Navegación dura para que el
    // middleware la vea y entre autenticado.
    window.location.assign('/hoy');
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Productividad</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          Entra con tu correo y contraseña.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '12px 14px',
              fontSize: 16,
            }}
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '12px 14px',
              fontSize: 16,
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'var(--grad-accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-input)',
              padding: '12px 14px',
              fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          {error && <p style={{ color: 'var(--negative)', fontSize: 14 }}>{error}</p>}
        </form>
      </div>
    </main>
  );
}
