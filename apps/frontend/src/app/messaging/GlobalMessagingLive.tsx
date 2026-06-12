// Global in-app notifications for live messages outside the inbox page
// FEATURE: Messaging inbox live updates
import {
  ConversationListItemDto,
  Message,
  UseMessagingServiceMessagingListConversationsKeyFn,
  useMessagingServiceMessagingMarkConversationRead,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import de from './de.json';
import en from './en.json';
import { applyIncomingMessage, markConversationReadInCache } from './messageCache';
import { useMessagingLive } from './useMessagingLive';

interface Props {
  enabled?: boolean;
}

function getSenderName(message: Message, conversations?: ConversationListItemDto[]): string | undefined {
  if (message.sender?.username) {
    return message.sender.username;
  }

  return conversations?.find((conversation) => conversation.id === message.conversationId)?.otherParticipant?.username;
}

function getConversationFromSearch(search: string): number | null {
  const conversationId = Number(new URLSearchParams(search).get('conversation'));
  return Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null;
}

export function GlobalMessagingLive({ enabled = true }: Props) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const location = useLocation();
  const navigate = useNavigate();
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

      const conversations = queryClient.getQueryData<ConversationListItemDto[]>(
        UseMessagingServiceMessagingListConversationsKeyFn(),
      );
      const senderName = getSenderName(message, conversations) ?? t('toast.newMessageFallbackSender');

      toast.info({
        title: t('toast.newMessageTitle', { sender: senderName }),
        description: message.content,
        duration: 4000,
        action: {
          label: t('toast.openMessage'),
          onClick: () => navigate(`/messages?conversation=${message.conversationId}`),
        },
      });
    },
    [location.pathname, location.search, markConversationRead, navigate, queryClient, t, toast, user?.id],
  );

  useMessagingLive({
    onMessage: handleLiveMessage,
    enabled: enabled && Boolean(user),
  });

  return null;
}
