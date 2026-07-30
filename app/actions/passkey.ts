'use server';

import { revalidatePath } from 'next/cache';
import { requireContext } from '@/lib/auth';

/** Quita un passkey del usuario (bajo RLS). El registro se hace por el endpoint
 *  WebAuthn; aquí solo el borrado, que no necesita el navegador. */
export async function removePasskeyAction(credentialId: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from('webauthn_credentials').delete().eq('credential_id', credentialId);
  revalidatePath('/ajustes');
}
