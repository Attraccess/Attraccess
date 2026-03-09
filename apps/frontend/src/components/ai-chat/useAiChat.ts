import { useCallback } from 'react';
import { getBaseUrl } from '../../api';
import { events } from 'fetch-event-stream';
import { useAiChatStore } from './ai-chat.store';
import { toast } from 'sonner';

export function useAiChat() {
  const store = useAiChatStore();

  const sendMessage = useCallback(
    async (text: string) => {
      store.addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      });
      store.setStreaming(true);

      const abortController = new AbortController();
      const url = `${getBaseUrl()}/api/ai/chat`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: store.conversationId,
            message: text,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Chat request failed: ${res.status}`);
        }

        const stream = events(res, abortController.signal);

        for await (const event of stream) {
          try {
            const data = JSON.parse(event.data as string);

            switch (data.type) {
              case 'conversation-id':
                store.setConversationId(data.conversationId);
                break;
              case 'text-delta':
                store.appendDelta(data.content);
                break;
              case 'tool-call':
                store.addToolCall({
                  id: data.id,
                  name: data.name,
                  description: data.description,
                  parameters: data.parameters,
                  status: 'pending',
                });
                break;
              case 'tool-result':
                store.updateToolCallStatus(data.id, 'executed', data.result);
                break;
              case 'error':
                toast.error(data.message || 'AI error');
                break;
              case 'done':
                store.finalizeAssistantMessage();
                break;
            }
          } catch {
            // skip unparseable events
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          toast.error('Failed to connect to AI assistant');
        }
      } finally {
        store.setStreaming(false);
        store.finalizeAssistantMessage();
      }
    },
    [store],
  );

  const approveActions = useCallback(
    async (actionIds: string[]) => {
      if (!store.conversationId) return;

      store.setStreaming(true);
      const abortController = new AbortController();
      const url = `${getBaseUrl()}/api/ai/chat/${store.conversationId}/approve`;

      try {
        for (const id of actionIds) {
          store.updateToolCallStatus(id, 'approved');
        }

        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionIds }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Approve request failed: ${res.status}`);
        }

        const stream = events(res, abortController.signal);

        for await (const event of stream) {
          try {
            const data = JSON.parse(event.data as string);

            switch (data.type) {
              case 'text-delta':
                store.appendDelta(data.content);
                break;
              case 'tool-call':
                store.addToolCall({
                  id: data.id,
                  name: data.name,
                  description: data.description,
                  parameters: data.parameters,
                  status: 'pending',
                });
                break;
              case 'tool-result':
                store.updateToolCallStatus(data.id, 'executed', data.result);
                break;
              case 'error':
                toast.error(data.message || 'AI error');
                break;
              case 'done':
                store.finalizeAssistantMessage();
                break;
            }
          } catch {
            // skip
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          toast.error('Failed to execute actions');
        }
      } finally {
        store.setStreaming(false);
        store.finalizeAssistantMessage();
      }
    },
    [store],
  );

  const rejectAction = useCallback(
    (actionId: string) => {
      store.updateToolCallStatus(actionId, 'rejected');
    },
    [store],
  );

  return { sendMessage, approveActions, rejectAction };
}
