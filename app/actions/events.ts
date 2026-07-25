'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import { patchCalendarEvent, deleteCalendarEvent } from '@/lib/calendar-sync';
import { ok, err, type Result } from '@/core/types';

export async function editEventAction(
  eventId: string,
  patch: { titulo?: string; fecha?: string; colorId?: string },
): Promise<Result<{ id: string }>> {
  const { supabase, ctx } = await requireContext();
  try {
    await patchCalendarEvent(supabase, ctx, eventId, patch);
    revalidatePath('/hoy');
    return ok({ id: eventId });
  } catch (e) {
    console.error('editEventAction:', e);
    return err('EXTERNAL_ERROR', 'No se pudo editar el evento en Google Calendar.');
  }
}

export async function deleteEventAction(eventId: string): Promise<Result<{ id: string }>> {
  const { supabase, ctx } = await requireContext();
  try {
    await deleteCalendarEvent(supabase, ctx, eventId);
    revalidatePath('/hoy');
    return ok({ id: eventId });
  } catch (e) {
    console.error('deleteEventAction:', e);
    return err('EXTERNAL_ERROR', 'No se pudo borrar el evento en Google Calendar.');
  }
}
