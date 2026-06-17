// Keeps message caches current from the per-user messaging stream.
// FEATURE: Messaging inbox live updates
import {
  Message,
  useMessagingServiceMessagingMarkConversationRead,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { applyIncomingMessage, markConversationReadInCache } from './messageCache';
import { useMessagingLive } from './useMessagingLive';

interface Props {
  enabled?: boolean;
}

function getConversationFromSearch(search: string): number | null {
  const conversationId = Number(new URLSearchParams(search).get('conversation'));
  return Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null;
}

export function GlobalMessagingLive({ enabled = true }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { mutate: markConversationRead } = useMessagingServiceMessagingMarkConversationRead();

  const handleLiveMessage = useCallback(
    (message: Message) => {
      const currentUserId = user?.id ?? -1;
      applyIncomingMessage(queryClient, message, currentUserId);

      const selectedConversationId =
        location.pathname === '/messages' ? getConversationFromSearch(location.search) : null;
      if (message.conversationId === selectedConversationId) {
        markConversationRead(
          { id: message.conversationId },
          {
            onSuccess: ({ total }) => markConversationReadInCache(queryClient, message.conversationId, total),
          },
        );
        return;
      }

      if (message.senderId === currentUserId) {
        return;
      }
    },
    [location.pathname, location.search, markConversationRead, queryClient, user?.id],
  );

  useMessagingLive({
    onMessage: handleLiveMessage,
    enabled: enabled && Boolean(user),
  });

  return null;
}
