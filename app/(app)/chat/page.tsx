import { requireContext } from '@/lib/auth';
import { getWebConversation, loadMessages } from '@/lib/chat';
import { ChatUI } from './chat-ui';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const { supabase, ctx } = await requireContext();
  const conversationId = await getWebConversation(supabase, ctx.userId);
  const initial = await loadMessages(supabase, conversationId);
  return <ChatUI initial={initial} />;
}
