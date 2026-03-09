import { useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import { useAiChatStore } from './ai-chat.store';

interface ServerMessage {
  role: string;
  content: string;
  createdAt: string;
}

interface ActiveConversation {
  uuid: string;
  title: string | null;
  messages: ServerMessage[];
}

interface ActiveConversationResult {
  loading: boolean;
  chatId: string;
  initialMessages: UIMessage[];
}

function serverMessagesToUI(messages: ServerMessage[]): UIMessage[] {
  return messages.map((m, i) => ({
    id: `restored-${i}`,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    parts: [{ type: 'text' as const, text: m.content }],
  }));
}

export function useActiveConversation(): ActiveConversationResult {
  const setConversationId = useAiChatStore((s) => s.setConversationId);

  const [state, setState] = useState<ActiveConversationResult>({
    loading: true,
    chatId: crypto.randomUUID(),
    initialMessages: [],
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/ai/conversations/active', { credentials: 'include' });
        if (!res.ok || cancelled) {
          if (!cancelled) setState((s) => ({ ...s, loading: false }));
          return;
        }

        const data: ActiveConversation | null = await res.json();
        if (cancelled) return;

        if (data && data.messages.length > 0) {
          setConversationId(data.uuid);
          setState({
            loading: false,
            chatId: data.uuid,
            initialMessages: serverMessagesToUI(data.messages),
          });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [setConversationId]);

  return state;
}
