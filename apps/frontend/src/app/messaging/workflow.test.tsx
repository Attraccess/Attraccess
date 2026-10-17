import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GlobalMessagingLive } from './GlobalMessagingLive';
import { MessagesPage } from './index';
import type { MessageThread } from './MessageThread';
import type { ConversationList } from './ConversationList';
import type { Message } from '@attraccess/react-query-client';
const state = vi.hoisted(() => ({
  user: { id: 1 } as { id: number } | undefined,
  permission: true,
  mark: vi.fn(),
  live: vi.fn(),
  onMessage: undefined as undefined | ((message: Message) => void),
  conversations: [
    { id: 7, otherParticipant: { username: 'Alex' }, unreadCount: 2 },
    { id: 8, otherParticipant: null, unreadCount: 1 },
  ],
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, hasPermission: () => state.permission }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useMessagingServiceMessagingListConversations: () => ({ data: state.conversations, isLoading: false }),
  useMessagingServiceMessagingMarkConversationRead: () => ({ mutate: state.mark }),
  UseMessagingServiceMessagingListConversationsKeyFn: () => ['conversations'],
  UseMessagingServiceMessagingGetUnreadCountKeyFn: () => ['unread'],
  useMessagingServiceMessagingListMessagesKey: 'messages',
}));
vi.mock('./useMessagingLive', () => ({
  useMessagingLive: (props: { onMessage: (message: Message) => void; enabled: boolean }) => {
    state.live(props.enabled);
    state.onMessage = props.onMessage;
  },
}));
vi.mock('./MessageThread', () => ({
  MessageThread: (props: ComponentProps<typeof MessageThread>) => <output>{JSON.stringify(props)}</output>,
}));
vi.mock('./ConversationList', () => ({
  ConversationList: ({ onSelect }: ComponentProps<typeof ConversationList>) => (
    <div>
      <button onClick={() => onSelect(7)}>Open Alex</button>
      <button onClick={() => onSelect(8)}>Open unknown</button>
    </div>
  ),
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 1 };
  state.permission = true;
  client = new QueryClient();
  client.setQueryData(['conversations'], state.conversations);
  client.setQueryData(['unread'], { total: 3 });
  state.mark.mockImplementation((_params: unknown, options: { onSuccess: (data: { total: number }) => void }) =>
    options.onSuccess({ total: 1 }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
});
function Location() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}
function mount(path: string, live = false, enabled = true) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        {live ? (
          <GlobalMessagingLive enabled={enabled} />
        ) : (
          <Routes>
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/settings/messaging" element={<p>Messaging settings</p>} />
          </Routes>
        )}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('opens deep links, marks them read and removes resource references when switching threads or returning to the inbox', async () => {
  mount('/messages?conversation=7&resourceRef=12&keep=yes');
  expect(screen.getByRole('status')).toHaveTextContent('"pendingResourceId":12');
  expect(screen.getByRole('status')).toHaveTextContent('"currentUserId":1');
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(state.mark).toHaveBeenCalledWith({ id: 7 }, expect.any(Object));
  expect(client.getQueryData(['conversations'])).toMatchObject([
    { id: 7, unreadCount: 0 },
    { id: 8, unreadCount: 1 },
  ]);
  expect(client.getQueryData(['unread'])).toEqual({ total: 1 });
  fireEvent.click(screen.getByText('Open unknown'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('"conversationId":8'));
  expect(screen.getByText('Unknown user')).toBeTruthy();
  expect(screen.getByRole('status')).not.toHaveTextContent('pendingResourceId');
  expect(screen.getByTestId('location')).toHaveTextContent('/messages?conversation=8&keep=yes');
  fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByTestId('location')).toHaveTextContent('/messages?keep=yes');
});
it('ignores invalid conversation links and routes permitted users to messaging settings', () => {
  mount('/messages?conversation=-2&resourceRef=bad');
  expect(screen.getByText('Select a conversation to view messages.')).toBeTruthy();
  expect(state.mark).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByText('Messaging settings')).toBeTruthy();
});
it('does not mark conversations read or reveal threads while unauthenticated', () => {
  state.user = undefined;
  state.permission = false;
  mount('/messages?conversation=7');
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  expect(state.mark).not.toHaveBeenCalled();
});
it.each(['/messages?conversation=7', '/messages?conversation=bad', '/resources/7?conversation=7'])(
  'updates live caches at %s and marks only an open conversation read',
  (path) => {
    mount(path, true);
    const message = { id: 10, conversationId: 7, senderId: 2, content: 'Hello' } as Message;
    act(() => state.onMessage?.(message));
    expect(state.live).toHaveBeenCalledWith(true);
    expect(client.getQueryData(['conversations'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 7, lastMessage: message })]),
    );
    if (path === '/messages?conversation=7') {
      expect(state.mark).toHaveBeenCalledWith({ id: 7 }, expect.any(Object));
      expect(client.getQueryData(['unread'])).toEqual({ total: 1 });
    } else {
      expect(state.mark).not.toHaveBeenCalled();
      expect(client.getQueryData(['unread'])).toEqual({ total: 4 });
    }
  },
);
it('does not count own messages as unread and disables the live subscription when gated', () => {
  const first = mount('/resources/7', true);
  act(() => state.onMessage?.({ id: 10, conversationId: 7, senderId: 1, content: 'Own message' } as Message));
  expect(client.getQueryData(['unread'])).toEqual({ total: 3 });
  expect(state.mark).not.toHaveBeenCalled();
  first.unmount();
  state.user = undefined;
  const second = mount('/messages', true);
  expect(state.live).toHaveBeenLastCalledWith(false);
  second.unmount();
  state.user = { id: 1 };
  mount('/messages', true, false);
  expect(state.live).toHaveBeenLastCalledWith(false);
});
