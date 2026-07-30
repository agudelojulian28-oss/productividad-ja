'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { createClient } from '@/adapters/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [supportsHuella, setSupportsHuella] = useState(false);

  useEffect(() => {
    setSupportsHuella(typeof window !== 'undefined' && !!window.PublicKeyCredential);
  }, []);

  async function entrarConHuella() {
    setError(null);
    setLoading(true);
    try {
      const optRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
      if (optRes.status === 404) throw new Error('Aún no has activado la huella en este dispositivo.');
      if (!optRes.ok) throw new Error('No se pudo iniciar el acceso con huella.');
      const optionsJSON = await optRes.json();
      const asseResp = await startAuthentication({ optionsJSON });
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(asseResp),
      });
      if (!verifyRes.ok) throw new Error('La huella no coincidió.');
      const { token_hash } = (await verifyRes.json()) as { token_hash: string };
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
      if (error) throw new Error(error.message);
      window.location.assign('/hoy');
    } catch (e) {
      setLoading(false);
      const m = e instanceof Error ? e.message : 'Error con la huella';
      setError(m.includes('NotAllowed') ? 'Cancelaste la huella.' : m);
    }
  }

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
          {supportsHuella && (
            <button
              type="button"
              onClick={entrarConHuella}
              disabled={loading}
              style={{
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                padding: '12px 14px',
                fontWeight: 600,
                opacity: loading ? 0.6 : 1,
              }}
            >
              🔒 Entrar con huella
            </button>
          )}
          {error && <p style={{ color: 'var(--negative)', fontSize: 14 }}>{error}</p>}
        </form>
      </div>
    </main>
  );
}
