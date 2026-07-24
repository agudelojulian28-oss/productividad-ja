// Núcleo del dominio. Código puro: no importa Next.js, Supabase, Anthropic ni canales.

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RULE_VIOLATION'
  | 'EXTERNAL_ERROR';

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; code: ErrorCode; message?: string; details?: unknown };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (code: ErrorCode, message?: string, details?: unknown): Err => ({
  ok: false,
  code,
  message,
  details,
});

export type Actor = 'user' | 'agent' | 'system';
export type Channel = 'web' | 'telegram' | 'whatsapp' | 'cron';

/** Contexto de quién actúa. Viaja a la auditoría por claims del JWT (ADR-016). */
export interface ActorContext {
  userId: string;
  actor: Actor;
  channel: Channel;
  /** Zona horaria del usuario. La aritmética de fechas va aquí, nunca en UTC. */
  tz: string;
  conversationId?: string;
  toolCallId?: string;
}
