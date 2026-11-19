'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from './empty-state';

/**
 * Pantalla de error de la app (cualquier página dentro de (app)). En producción Next oculta el
 * mensaje real del error, así que en vez de adivinar por el texto, sondea la API de Supabase:
 * si no responde (p. ej. 503 PGRST002 "schema cache"), lo dice claro y qué hacer.
 */
type Probe = 'checking' | 'db-down' | 'db-ok';

async function probeSupabase(): Promise<Probe> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return 'db-ok';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${url}/rest/v1/projects?select=id&limit=1`, {
      headers: { apikey: key },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    return res.status >= 500 ? 'db-down' : 'db-ok';
  } catch {
    return 'db-down'; // sin respuesta o timeout
  }
}

const icon = (
  <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
    <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17 15l4 4M21 15l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [probe, setProbe] = useState<Probe>('checking');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error(error);
    let alive = true;
    void probeSupabase().then((p) => alive && setProbe(p));
    return () => {
      alive = false;
    };
  }, [error]);

  const retry = async () => {
    setRetrying(true);
    const p = await probeSupabase();
    setProbe(p);
    setRetrying(false);
    if (p === 'db-ok') reset();
  };

  const down = probe === 'db-down';
  return (
    <div className="page">
      <div role="alert" aria-live="assertive">
        <EmptyState
          icon={icon}
          title={
            probe === 'checking'
              ? 'Algo falló al cargar esta página…'
              : down
                ? 'La base de datos (Supabase) no está respondiendo'
                : 'Algo falló al cargar esta página'
          }
          hint={
            probe === 'checking'
              ? 'Revisando si la base de datos responde.'
              : down
                ? 'Tus datos están a salvo: es la API de Supabase, no la app. Suele volver sola en un par de minutos. Si pasan más de 5, reinicia el proyecto en Supabase (Settings → General → Restart project).'
                : `La base responde bien, así que fue un error puntual. Reintenta; si se repite, avísale a Claude${error.digest ? ` con este código: ${error.digest}` : ''}.`
          }
          action={
            <button type="button" className="btn-primary" onClick={retry} disabled={retrying}>
              {retrying ? 'Comprobando…' : 'Reintentar'}
            </button>
          }
        />
      </div>
    </div>
  );
}
