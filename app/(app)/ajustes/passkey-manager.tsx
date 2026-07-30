'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { removePasskeyAction } from '@/app/actions/passkey';

type Cred = { credentialId: string; label: string | null; createdAt: string };

export function PasskeyManager({ credentials }: { credentials: Cred[] }) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && !!window.PublicKeyCredential);
  }, []);

  async function activar() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      if (!optRes.ok) throw new Error('No se pudieron pedir las opciones.');
      const optionsJSON = await optRes.json();
      const response = await startRegistration({ optionsJSON });
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response, label: navigator.userAgent.slice(0, 80) }),
      });
      if (!verifyRes.ok) throw new Error(await verifyRes.text());
      setMsg('Huella activada en este dispositivo ✓');
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo activar';
      setError(m.includes('NotAllowed') ? 'Cancelaste la huella.' : m);
    } finally {
      setBusy(false);
    }
  }

  function quitar(credentialId: string) {
    startTransition(async () => {
      await removePasskeyAction(credentialId);
      router.refresh();
    });
  }

  return (
    <div className="row-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="task-body">
          <span className="task-title">Entrar con huella</span>
          <span className="task-meta">
            Registra la huella/Face ID de este dispositivo para entrar sin escribir la contraseña.
          </span>
        </div>
        {supported ? (
          <button className="btn-primary" onClick={activar} disabled={busy}>
            {busy ? '…' : 'Activar'}
          </button>
        ) : (
          <span className="task-meta">No disponible en este navegador</span>
        )}
      </div>

      {msg && <p className="ok-text">{msg}</p>}
      {error && <p className="error-text">{error}</p>}

      {credentials.length > 0 && (
        <ul className="fin-list">
          {credentials.map((c) => (
            <li key={c.credentialId} className="fin-row">
              <span className="fin-row-name">{c.label ?? 'Dispositivo'}</span>
              <button
                className="linkbtn task-delete"
                onClick={() => quitar(c.credentialId)}
                disabled={pending}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
