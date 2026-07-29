// Adaptador de Google Calendar: solo HTTP a la API de Google. Recibe un access token.

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalEvent {
  summary: string;
  startIso: string;
  endIso: string;
  tz: string;
  colorId?: string;
  recurrence?: string[];
  description?: string;
  /** Asociación al árbol de la app (se guarda en extendedProperties.private). */
  projectId?: string;
  goalId?: string;
}

export interface GEvent {
  id: string;
  summary: string;
  start: string | null; // ISO (dateTime) o fecha (YYYY-MM-DD para todo el día)
  end: string | null;
  colorId: string | null;
  allDay: boolean;
  htmlLink: string;
  description: string | null;
  /** Proyecto/meta asociados (de extendedProperties.private), si los hay. */
  projectId: string | null;
  goalId: string | null;
  /** Si es una instancia de una serie recurrente, el id del evento maestro. */
  recurringEventId: string | null;
  /** Reglas de recurrencia (RRULE) si el evento es la serie maestra. */
  recurrence: string[] | null;
}

interface RawEvent {
  id: string;
  summary?: string;
  colorId?: string;
  htmlLink?: string;
  description?: string;
  recurringEventId?: string;
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function mapEvent(e: RawEvent): GEvent {
  return {
    id: e.id,
    summary: e.summary ?? '(sin título)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    colorId: e.colorId ?? null,
    allDay: Boolean(e.start?.date),
    htmlLink: e.htmlLink ?? '',
    description: e.description ?? null,
    projectId: e.extendedProperties?.private?.project_id ?? null,
    goalId: e.extendedProperties?.private?.goal_id ?? null,
    recurringEventId: e.recurringEventId ?? null,
    recurrence: e.recurrence ?? null,
  };
}

/** Lista los eventos del calendario primario en un rango (RFC3339). */
export async function listEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GEvent[]> {
  const p = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const res = await fetch(`${BASE}?${p.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('listEvents: ' + (await res.text()));
  const j = (await res.json()) as { items?: RawEvent[] };
  return (j.items ?? []).map(mapEvent);
}

/** Lista eventos con una privateExtendedProperty `key=value` (para colgar eventos
 *  de un proyecto/meta). Ventana amplia: -90 días a +1 año. */
export async function listEventsByProperty(
  accessToken: string,
  key: string,
  value: string,
): Promise<GEvent[]> {
  const now = Date.now();
  const p = new URLSearchParams({
    privateExtendedProperty: `${key}=${value}`,
    timeMin: new Date(now - 90 * 86_400_000).toISOString(),
    timeMax: new Date(now + 365 * 86_400_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const res = await fetch(`${BASE}?${p.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('listEventsByProperty: ' + (await res.text()));
  const j = (await res.json()) as { items?: RawEvent[] };
  return (j.items ?? []).map(mapEvent);
}

function body(ev: CalEvent) {
  return JSON.stringify({
    summary: ev.summary,
    start: { dateTime: ev.startIso, timeZone: ev.tz },
    end: { dateTime: ev.endIso, timeZone: ev.tz },
    ...(ev.colorId ? { colorId: ev.colorId } : {}),
    ...(ev.recurrence ? { recurrence: ev.recurrence } : {}),
    ...(ev.description !== undefined ? { description: ev.description } : {}),
    ...(ev.projectId || ev.goalId
      ? {
          extendedProperties: {
            private: {
              ...(ev.projectId ? { project_id: ev.projectId } : {}),
              ...(ev.goalId ? { goal_id: ev.goalId } : {}),
            },
          },
        }
      : {}),
  });
}

export async function createEvent(
  accessToken: string,
  ev: CalEvent,
): Promise<{ calendarId: string; eventId: string }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: body(ev),
  });
  if (!res.ok) throw new Error('createEvent: ' + (await res.text()));
  const j = (await res.json()) as { id: string };
  return { calendarId: 'primary', eventId: j.id };
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  ev: CalEvent,
): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: body(ev),
  });
  if (!res.ok) throw new Error('updateEvent: ' + (await res.text()));
}

export async function getEvent(accessToken: string, eventId: string): Promise<GEvent | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error('getEvent: ' + (await res.text()));
  const e = (await res.json()) as RawEvent;
  return mapEvent(e);
}

export interface EventPatch {
  summary?: string;
  startIso?: string;
  endIso?: string;
  tz?: string;
  colorId?: string;
  description?: string | null;
  /** Asociación al árbol; `null` quita la etiqueta (extendedProperties.private). */
  projectId?: string | null;
  goalId?: string | null;
  /** RRULE(s); `[]` quita la recurrencia (evento pasa a único). Solo en la serie maestra. */
  recurrence?: string[];
}

export async function patchEvent(
  accessToken: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) body.summary = patch.summary;
  if (patch.colorId !== undefined) body.colorId = patch.colorId;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.projectId !== undefined || patch.goalId !== undefined) {
    const priv: Record<string, string | null> = {};
    if (patch.projectId !== undefined) priv.project_id = patch.projectId; // null borra la clave
    if (patch.goalId !== undefined) priv.goal_id = patch.goalId;
    body.extendedProperties = { private: priv };
  }
  if (patch.startIso) body.start = { dateTime: patch.startIso, timeZone: patch.tz };
  if (patch.endIso) body.end = { dateTime: patch.endIso, timeZone: patch.tz };
  if (patch.recurrence !== undefined) body.recurrence = patch.recurrence;
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('patchEvent: ' + (await res.text()));
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  // 404/410 = ya no existe: lo tratamos como éxito.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error('deleteEvent: ' + (await res.text()));
  }
}
