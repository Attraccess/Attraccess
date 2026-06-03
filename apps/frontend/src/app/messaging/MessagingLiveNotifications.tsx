// Subscribes app-wide to live messages and toasts ones the user is not viewing
// FEATURE: Messaging toast notifications
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ConversationListItemDto,
  Message,
  UseMessagingServiceMessagingListConversationsKeyFn,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../hooks/useAuth';
import { useToastMessage } from '../../components/toastProvider';
import { useMessagingLive } from './useMessagingLive';
import { applyIncomingMessage } from './messageCache';
import en from './en.json';
import de from './de.json';

export function MessagingLiveNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToastMessage();
  const { t } = useTranslations({ en, de });

  const handleMessage = useCallback(
    (message: Message) => {
      applyIncomingMessage(queryClient, message);

      if (user && message.senderId === user.id) {
        return;
      }

      const isViewingConversation =
        location.pathname === '/messages' &&
        new URLSearchParams(location.search).get('conversation') === String(message.conversationId);
      if (isViewingConversation) {
        return;
      }

      const conversations = queryClient.getQueryData<ConversationListItemDto[]>(
        UseMessagingServiceMessagingListConversationsKeyFn(),
      );
      const senderName =
        conversations?.find((conversation) => conversation.id === message.conversationId)?.otherParticipant?.username ??
        t('toast.unknownSender');

      toast.info({
        title: t('toast.title', { sender: senderName }),
        description: message.content,
        action: {
          label: t('toast.view'),
          onClick: () => navigate(`/messages?conversation=${message.conversationId}`),
        },
      });
    },
    [queryClient, user, location.pathname, location.search, t, toast, navigate],
  );

  useMessagingLive({ onMessage: handleMessage, enabled: !!user });

  return null;
}

export default MessagingLiveNotifications;
