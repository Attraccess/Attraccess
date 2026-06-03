// Stitches a single message into cached message-list and conversation-list data
// FEATURE: Messaging live cache updates without full refetch
import { QueryClient } from '@tanstack/react-query';
import {
  ConversationListItemDto,
  ListMessagesResponseDto,
  Message,
  UnreadCountResponseDto,
  UseMessagingServiceMessagingGetUnreadCountKeyFn,
  UseMessagingServiceMessagingListConversationsKeyFn,
  useMessagingServiceMessagingListMessagesKey,
} from '@attraccess/react-query-client';

export function applyIncomingMessage(queryClient: QueryClient, message: Message, currentUserId: number) {
  // Own messages never count as unread for the sender — only stitch them into the thread/list.
  const isOwnMessage = message.senderId === currentUserId;

  queryClient.setQueriesData<ListMessagesResponseDto>(
    {
      predicate: (query) =>
        query.queryKey[0] === useMessagingServiceMessagingListMessagesKey &&
        (query.queryKey[1] as { id?: number } | undefined)?.id === message.conversationId,
    },
    (current) => {
      if (!current || current.data.some((existing) => existing.id === message.id)) {
        return current;
      }
      return { ...current, total: current.total + 1, data: [message, ...current.data] };
    },
  );

  queryClient.setQueryData<ConversationListItemDto[]>(
    UseMessagingServiceMessagingListConversationsKeyFn(),
    (current) => {
      if (!current) {
        return current;
      }
      const index = current.findIndex((conversation) => conversation.id === message.conversationId);
      if (index === -1) {
        queryClient.invalidateQueries({ queryKey: UseMessagingServiceMessagingListConversationsKeyFn() });
        return current;
      }
      const updated = {
        ...current[index],
        lastMessage: message,
        unreadCount: (current[index].unreadCount ?? 0) + (isOwnMessage ? 0 : 1),
      };
      return [updated, ...current.slice(0, index), ...current.slice(index + 1)];
    },
  );

  if (!isOwnMessage) {
    bumpTotalUnread(queryClient, 1);
  }
}

export function markConversationReadInCache(queryClient: QueryClient, conversationId: number, total: number) {
  queryClient.setQueryData<ConversationListItemDto[]>(
    UseMessagingServiceMessagingListConversationsKeyFn(),
    (current) =>
      current?.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
  );

  queryClient.setQueryData<UnreadCountResponseDto>(UseMessagingServiceMessagingGetUnreadCountKeyFn(), { total });
}

function bumpTotalUnread(queryClient: QueryClient, delta: number) {
  queryClient.setQueryData<UnreadCountResponseDto>(
    UseMessagingServiceMessagingGetUnreadCountKeyFn(),
    (current) => ({ total: Math.max(0, (current?.total ?? 0) + delta) }),
  );
}
