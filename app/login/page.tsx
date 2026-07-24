'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/adapters/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Productividad</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          Entra con tu correo. Te enviamos un enlace.
        </p>

        {sent ? (
          <div
            style={{
              background: 'var(--positive-weak)',
              color: 'var(--positive)',
              padding: 16,
              borderRadius: 'var(--radius-card)',
            }}
          >
            Revisa tu correo <strong>{email}</strong> y abre el enlace para entrar.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
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
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            {error && <p style={{ color: 'var(--negative)', fontSize: 14 }}>{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
