// Stitches a single message into cached message-list and conversation-list data
// FEATURE: Messaging live cache updates without full refetch
import { QueryClient } from '@tanstack/react-query';
import {
  ConversationListItemDto,
  ListMessagesResponseDto,
  Message,
  UseMessagingServiceMessagingListConversationsKeyFn,
  useMessagingServiceMessagingListMessagesKey,
} from '@attraccess/react-query-client';

export function applyIncomingMessage(queryClient: QueryClient, message: Message) {
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
      return [{ ...current[index], lastMessage: message }, ...current.slice(0, index), ...current.slice(index + 1)];
    },
  );
}
