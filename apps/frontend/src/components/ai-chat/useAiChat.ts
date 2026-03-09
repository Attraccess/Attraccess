import { useCallback, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useAiChatStore } from './ai-chat.store';

export function useAiChat(chatId: string, initialMessages: UIMessage[]) {
  const store = useAiChatStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const transportRef = useRef(
    new DefaultChatTransport({
      api: '/api/ai/chat',
      credentials: 'include',
      fetch: async (url, init) => {
        const response = await globalThis.fetch(url, init);
        const convId = response.headers.get('X-Conversation-Id');
        if (convId) {
          storeRef.current.setConversationId(convId);
        }
        return response;
      },
    })
  );

  const onError = useCallback((error: Error) => {
    console.error('[AI Chat] Stream error:', error.message, error);
  }, []);

  const chat = useChat({
    id: chatId,
    transport: transportRef.current,
    initialMessages,
    onError,
  });

  return chat;
}
