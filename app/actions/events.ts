'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';
import {
  patchCalendarEvent,
  deleteCalendarEvent,
  createCalendarEvent,
} from '@/lib/calendar-sync';
import { ok, err, type Result } from '@/core/types';

export async function createEventAction(input: {
  titulo: string;
  fecha: string;
  colorId?: string;
  durationMin?: number;
  descripcion?: string;
  projectId?: string;
  goalId?: string;
}): Promise<Result<{ id: string }>> {
  const { supabase, ctx } = await requireContext();
  try {
    const id = await createCalendarEvent(supabase, ctx, input);
    revalidatePath('/calendario');
    revalidatePath('/hoy');
    return ok({ id });
  } catch (e) {
    console.error('createEventAction:', e);
    return err('EXTERNAL_ERROR', 'No se pudo crear el evento en Google Calendar.');
  }
}

export async function editEventAction(
  eventId: string,
  patch: {
    titulo?: string;
    fecha?: string;
    colorId?: string;
    durationMin?: number;
    descripcion?: string | null;
  },
): Promise<Result<{ id: string }>> {
  const { supabase, ctx } = await requireContext();
  try {
    await patchCalendarEvent(supabase, ctx, eventId, patch);
    revalidatePath('/calendario');
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
    revalidatePath('/calendario');
    revalidatePath('/hoy');
    return ok({ id: eventId });
  } catch (e) {
    console.error('deleteEventAction:', e);
    return err('EXTERNAL_ERROR', 'No se pudo borrar el evento en Google Calendar.');
  }
}
