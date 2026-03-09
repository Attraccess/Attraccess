import { useCallback, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useAiChatStore } from './ai-chat.store';

export function useAiChat() {
  const store = useAiChatStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const chatIdRef = useRef(store.conversationId || crypto.randomUUID());

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
    id: chatIdRef.current,
    transport: transportRef.current,
    onError,
  });

  return chat;
}
