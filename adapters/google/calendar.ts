// Adaptador de Google Calendar: solo HTTP a la API de Google. Recibe un access token.

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalEvent {
  summary: string;
  startIso: string;
  endIso: string;
  tz: string;
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
