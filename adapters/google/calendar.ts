// Adaptador de Google Calendar: solo HTTP a la API de Google. Recibe un access token.

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalEvent {
  summary: string;
  startIso: string;
  endIso: string;
  tz: string;
}

export interface GEvent {
  id: string;
  summary: string;
  start: string | null; // ISO (dateTime) o fecha (YYYY-MM-DD para todo el día)
  end: string | null;
  colorId: string | null;
  allDay: boolean;
  htmlLink: string;
}

interface RawEvent {
  id: string;
  summary?: string;
  colorId?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
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
  return (j.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(sin título)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    colorId: e.colorId ?? null,
    allDay: Boolean(e.start?.date),
    htmlLink: e.htmlLink ?? '',
  }));
}

function body(ev: CalEvent) {
  return JSON.stringify({
    summary: ev.summary,
    start: { dateTime: ev.startIso, timeZone: ev.tz },
    end: { dateTime: ev.endIso, timeZone: ev.tz },
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
