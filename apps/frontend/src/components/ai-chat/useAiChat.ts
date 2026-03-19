import { useCallback, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function useAiChat() {
  const chatIdRef = useRef(crypto.randomUUID());

  const transportRef = useRef(
    new DefaultChatTransport({
      api: '/api/ai/chat',
      credentials: 'include',
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
