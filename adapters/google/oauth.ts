// Adaptador de OAuth de Google (solo HTTP a los endpoints de Google).

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function env() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URL ?? '',
  };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = env();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent', // fuerza refresh_token aunque ya haya consentido antes
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = env();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('Google token exchange falló: ' + (await res.text()));
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = env();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Google refresh falló: ' + (await res.text()));
  const j = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: j.access_token,
    expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  };
}
