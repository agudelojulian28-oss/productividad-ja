import type { ServerSupabase } from '@/adapters/supabase/server';
import type { ActorContext } from '@/core/types';
import type { WorkRepo, TaskRow } from '@/core/work/ports';
import { getGoogleTokenCipher } from '@/adapters/supabase/integrations';
import { decryptToken } from '@/lib/crypto';
import { refreshAccessToken } from '@/adapters/google/oauth';
import { createEvent, updateEvent } from '@/adapters/google/calendar';

const DURATION_MIN = 30;

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
