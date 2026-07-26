import type { ServerSupabase } from '@/adapters/supabase/server';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** La conversación del usuario en un canal (una sola; se reutiliza la más reciente). */
export async function getConversation(
  supabase: ServerSupabase,
  userId: string,
  channel: string,
): Promise<string> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('channel', channel)
    .order('last_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return (data as { id: string }).id;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, channel })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}

/** La conversación web del usuario. */
export function getWebConversation(supabase: ServerSupabase, userId: string): Promise<string> {
  return getConversation(supabase, userId, 'web');
}

export async function loadMessages(
  supabase: ServerSupabase,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('role,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50);
  return ((data as { role: 'user' | 'assistant'; content: string }[] | null) ?? []).map((m) => ({
    role: m.role,
    text: m.content,
  }));
}

export async function saveMessage(
  supabase: ServerSupabase,
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant',
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, user_id: userId, role, content: text });
  await supabase
    .from('conversations')
    .update({ last_at: new Date().toISOString() })
    .eq('id', conversationId);
}
