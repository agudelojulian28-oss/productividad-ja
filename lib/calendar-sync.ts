import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import { getGoogleTokenCipher } from '@/adapters/supabase/integrations';
import { decryptToken } from '@/lib/crypto';
import { refreshAccessToken } from '@/adapters/google/oauth';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  getEvent,
  patchEvent,
  type GEvent,
  type EventPatch,
} from '@/adapters/google/calendar';

const DURATION_MIN = 30;

/** Borra un evento de Google Calendar. */
export async function deleteCalendarEvent(
  supabase: ServerSupabase,
  ctx: ActorContext,
  eventId: string,
): Promise<void> {
  const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
  if (!cipher) throw new Error('Google no está conectado');
  const { accessToken } = await refreshAccessToken(decryptToken(cipher));
  await deleteEvent(accessToken, eventId);
}

/** Crea un evento en Google Calendar. Devuelve el id del evento creado. */
export async function createCalendarEvent(
  supabase: ServerSupabase,
  ctx: ActorContext,
  input: { titulo: string; fecha: string; colorId?: string; durationMin?: number },
): Promise<string> {
  const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
  if (!cipher) throw new Error('Google no está conectado');
  const { accessToken } = await refreshAccessToken(decryptToken(cipher));

  const durMs = (input.durationMin ?? DURATION_MIN) * 60000;
  const endIso = new Date(new Date(input.fecha).getTime() + durMs).toISOString();
  const { eventId } = await createEvent(accessToken, {
    summary: input.titulo,
    startIso: input.fecha,
    endIso,
    tz: ctx.tz,
    colorId: input.colorId,
  });
  return eventId;
}

/** Edita un evento de Google (título / hora / color / duración).
 *  - `fecha` sin `durationMin`: mueve el inicio y preserva la duración original.
 *  - `durationMin` sin `fecha`: redimensiona (mismo inicio, nuevo fin).
 *  - ambos: mueve y fija la duración. */
export async function patchCalendarEvent(
  supabase: ServerSupabase,
  ctx: ActorContext,
  eventId: string,
  patch: { titulo?: string; fecha?: string; colorId?: string; durationMin?: number },
): Promise<void> {
  const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
  if (!cipher) throw new Error('Google no está conectado');
  const { accessToken } = await refreshAccessToken(decryptToken(cipher));

  const fields: EventPatch = {};
  if (patch.titulo !== undefined) fields.summary = patch.titulo;
  if (patch.colorId !== undefined) fields.colorId = patch.colorId;

  if (patch.fecha || patch.durationMin !== undefined) {
    // Fin explícito por duración, o duración preservada del evento actual.
    let startMs: number;
    let durationMs = (patch.durationMin ?? DURATION_MIN) * 60000;

    if (patch.fecha) {
      startMs = new Date(patch.fecha).getTime();
      if (patch.durationMin === undefined) {
        const ev = await getEvent(accessToken, eventId);
        if (ev?.start && ev.end && !ev.allDay) {
          durationMs = new Date(ev.end).getTime() - new Date(ev.start).getTime();
        }
      }
    } else {
      // Redimensionado puro: conservar el inicio actual.
      const ev = await getEvent(accessToken, eventId);
      if (!ev?.start) throw new Error('Evento sin hora de inicio');
      startMs = new Date(ev.start).getTime();
    }

    fields.startIso = new Date(startMs).toISOString();
    fields.endIso = new Date(startMs + durationMs).toISOString();
    fields.tz = ctx.tz;
  }
  await patchEvent(accessToken, eventId, fields);
}

/** Offset (+/-HH:MM) de la zona en una fecha dada (maneja horario de verano). */
function offsetFor(dateYmd: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dateYmd}T12:00:00Z`));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m?.[1] ?? '+00:00';
}

/** Eventos de Google del día (zona del usuario). [] si no hay conexión o falla. */
export async function getDayEvents(
  supabase: ServerSupabase,
  ctx: ActorContext,
  dateYmd: string,
): Promise<GEvent[]> {
  try {
    const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
    if (!cipher) return [];
    const { accessToken } = await refreshAccessToken(decryptToken(cipher));
    const off = offsetFor(dateYmd, ctx.tz);
    return await listEvents(accessToken, `${dateYmd}T00:00:00${off}`, `${dateYmd}T23:59:59${off}`);
  } catch (e) {
    console.error('getDayEvents:', e);
    return [];
  }
}

/** Eventos de Google en un rango de días [startYmd, endYmd] inclusive (zona del
 *  usuario). [] si no hay conexión o falla. */
export async function getRangeEvents(
  supabase: ServerSupabase,
  ctx: ActorContext,
  startYmd: string,
  endYmd: string,
): Promise<GEvent[]> {
  try {
    const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
    if (!cipher) return [];
    const { accessToken } = await refreshAccessToken(decryptToken(cipher));
    const offStart = offsetFor(startYmd, ctx.tz);
    const offEnd = offsetFor(endYmd, ctx.tz);
    return await listEvents(
      accessToken,
      `${startYmd}T00:00:00${offStart}`,
      `${endYmd}T23:59:59${offEnd}`,
    );
  } catch (e) {
    console.error('getRangeEvents:', e);
    return [];
  }
}

/** Borra el evento de Google asociado. No-op si Google no está conectado. */
export async function removeTaskEvent(
  supabase: ServerSupabase,
  ctx: ActorContext,
  eventId: string,
): Promise<void> {
  try {
    const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
    if (!cipher) return;
    const { accessToken } = await refreshAccessToken(decryptToken(cipher));
    await deleteEvent(accessToken, eventId);
  } catch (e) {
    console.error('calendar delete:', e);
  }
}

/** Sincroniza una tarea con Google Calendar. No-op si Google no está conectado.
 *  Un fallo de calendario nunca rompe la operación de la tarea. */
export async function syncTaskToCalendar(
  supabase: ServerSupabase,
  ctx: ActorContext,
  repo: WorkRepo,
  task: TaskRow,
): Promise<void> {
  if (!task.dueAt) return;
  try {
    const cipher = await getGoogleTokenCipher(supabase, ctx.userId);
    if (!cipher) return;
    const refreshToken = decryptToken(cipher);
    const { accessToken } = await refreshAccessToken(refreshToken);

    const endIso = new Date(new Date(task.dueAt).getTime() + DURATION_MIN * 60000).toISOString();
    const ev = { summary: task.title, startIso: task.dueAt, endIso, tz: ctx.tz };

    if (task.googleEventId) {
      await updateEvent(accessToken, task.googleEventId, ev);
    } else {
      const { calendarId, eventId } = await createEvent(accessToken, ev);
      await repo.updateTask(task.id, { googleCalendarId: calendarId, googleEventId: eventId });
    }
  } catch (e) {
    console.error('calendar sync:', e);
  }
}
