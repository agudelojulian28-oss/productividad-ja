import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type { ServerSupabase } from './server';
import type { Channel } from '@/core/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export interface ActorClaims {
  channel: Channel;
  conversationId?: string;
  toolCallId?: string;
}

/** Firma un JWT efímero (2 min) del usuario único. HS256 con el secreto legado
 *  (ADR-018). Lleva claims de actor para que la auditoría por trigger distinga el
 *  origen (ADR-016). El agente nunca usa service_role: actúa bajo RLS (ADR-017). */
export function signUserJwt(userId: string, claims: ActorClaims): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('Falta SUPABASE_JWT_SECRET');
  return jwt.sign(
    {
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
      actor: 'agent',
      channel: claims.channel,
      conversation: claims.conversationId ?? null,
      tool_call: claims.toolCallId ?? null,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '2m' },
  );
}

/** Cliente Supabase que actúa como el usuario único con RLS activa, usando el JWT
 *  efímero como bearer. Es el camino del worker: reclamar inbox y trabajar bajo RLS. */
export function createUserClient(userId: string, claims: ActorClaims): ServerSupabase {
  const token = signUserJwt(userId, claims);
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Misma clase SupabaseClient que el cliente SSR; el tipo ServerSupabase unifica el uso.
  return client as unknown as ServerSupabase;
}
