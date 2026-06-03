import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  ConversationListItemDto,
  Message,
  UnreadCountResponseDto,
  UseMessagingServiceMessagingGetUnreadCountKeyFn,
  UseMessagingServiceMessagingListConversationsKeyFn,
} from '@attraccess/react-query-client';
import { applyIncomingMessage } from './messageCache';

const CURRENT_USER_ID = 1;
const OTHER_USER_ID = 2;
const CONVERSATION_ID = 10;

function makeMessage(senderId: number, overrides: Partial<Message> = {}): Message {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    conversationId: CONVERSATION_ID,
    senderId,
    content: 'hi',
    createdAt: new Date().toISOString(),
    referenceType: null,
    referenceId: null,
    referenceLabel: null,
    referenceUrl: null,
    ...overrides,
  } as unknown as Message;
}

function seedCaches(queryClient: QueryClient) {
  queryClient.setQueryData<ConversationListItemDto[]>(UseMessagingServiceMessagingListConversationsKeyFn(), [
    { id: CONVERSATION_ID, unreadCount: 0 } as unknown as ConversationListItemDto,
  ]);
  queryClient.setQueryData<UnreadCountResponseDto>(UseMessagingServiceMessagingGetUnreadCountKeyFn(), { total: 0 });
}

function readUnread(queryClient: QueryClient) {
  const list = queryClient.getQueryData<ConversationListItemDto[]>(
    UseMessagingServiceMessagingListConversationsKeyFn(),
  );
  const total = queryClient.getQueryData<UnreadCountResponseDto>(
    UseMessagingServiceMessagingGetUnreadCountKeyFn(),
  );
  return { conversationUnread: list?.[0]?.unreadCount ?? 0, total: total?.total ?? 0 };
}

describe('applyIncomingMessage', () => {
  it('does not increase unread counters for the sender\'s own message', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    applyIncomingMessage(queryClient, makeMessage(CURRENT_USER_ID), CURRENT_USER_ID);

    expect(readUnread(queryClient)).toEqual({ conversationUnread: 0, total: 0 });
  });

  it('increases unread counters for a message from another user', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    applyIncomingMessage(queryClient, makeMessage(OTHER_USER_ID), CURRENT_USER_ID);

    expect(readUnread(queryClient)).toEqual({ conversationUnread: 1, total: 1 });
  });
});
