import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageReferenceType, type ConversationListItemDto } from '@attraccess/react-query-client';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
const state = vi.hoisted(() => ({
  loading: false,
  sending: false,
  list: vi.fn(),
  data: {
    total: 0,
    data: [] as {
      id: number;
      content: string;
      senderId: number;
      createdAt: string;
      referenceLabel?: string;
      referenceUrl?: string;
    }[],
  },
  resource: undefined as undefined | { name: string },
  send: vi.fn(),
  apply: vi.fn(),
  success: undefined as undefined | ((value: unknown) => void),
  client: {},
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => state.client }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource }),
  useMessagingServiceMessagingListMessages: (args: unknown) => {
    state.list(args);
    return { data: state.data, isLoading: state.loading };
  },
  useMessagingServiceMessagingSendMessage: ({ onSuccess }: { onSuccess: typeof state.success }) => {
    state.success = onSuccess;
    return { mutate: state.send, isPending: state.sending };
  },
}));
vi.mock('./messageCache', () => ({ applyIncomingMessage: state.apply }));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.sending = false;
  state.data = { total: 0, data: [] };
  state.resource = undefined;
});
afterEach(cleanup);
it('shows loading and empty conversation lists', () => {
  const view = render(<ConversationList isLoading selectedConversationId={null} onSelect={vi.fn()} />);
  expect(screen.queryByText('conversations.empty')).toBeNull();
  view.rerender(<ConversationList isLoading={false} selectedConversationId={null} onSelect={vi.fn()} />);
  expect(screen.getByText('conversations.empty')).toBeTruthy();
});
it('marks selection and online participants, caps unread badges, and handles missing metadata', () => {
  const select = vi.fn();
  const conversations = [
    {
      id: 1,
      otherParticipant: { username: 'Ada' },
      otherParticipantOnline: true,
      unreadCount: 120,
      lastMessage: { content: 'Latest message', createdAt: '2026-01-02' },
    },
    { id: 2, unreadCount: 2 },
    { id: 3, otherParticipant: { username: 'Read thread' } },
  ] as ConversationListItemDto[];
  render(
    <ConversationList conversations={conversations} isLoading={false} selectedConversationId={1} onSelect={select} />,
  );
  expect(screen.getByRole('button', { name: /Ada/ })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByLabelText('conversations.online')).toBeTruthy();
  expect(screen.getByText('99+')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /conversations.unknownUser/ }));
  expect(select).toHaveBeenCalledWith(2);
});
it('orders messages chronologically, displays references and requests older messages', () => {
  state.data = {
    total: 25,
    data: [
      {
        id: 2,
        content: 'Newer',
        senderId: 1,
        createdAt: '2026-01-02',
        referenceLabel: 'Lathe',
        referenceUrl: '/resources/7',
      },
      { id: 1, content: 'Older', senderId: 2, createdAt: '2026-01-01', referenceLabel: 'Deleted resource' },
    ],
  };
  const view = render(
    <MemoryRouter>
      <MessageThread conversationId={8} currentUserId={1} />
    </MemoryRouter>,
  );
  expect(
    Array.from(view.container.querySelectorAll('[data-cy^="message-"]'))
      .filter((node) => /^message-\d+$/.test(node.getAttribute('data-cy') ?? ''))
      .map((node) => node.getAttribute('data-cy')),
  ).toEqual(['message-1', 'message-2']);
  expect(screen.getByRole('link', { name: 'Lathe' })).toHaveAttribute('href', '/resources/7');
  expect(screen.getByRole('link', { name: 'Deleted resource' })).toHaveAttribute('href', '/');
  fireEvent.click(screen.getByRole('button', { name: 'thread.loadOlder' }));
  expect(state.list).toHaveBeenLastCalledWith({ id: 8, page: 1, limit: 40 });
});
it('sends trimmed replies with a resource reference and clears the composer after success', () => {
  state.resource = { name: 'Saw' };
  render(
    <MemoryRouter>
      <MessageThread conversationId={8} currentUserId={1} pendingResourceId={7} />
    </MemoryRouter>,
  );
  const input = screen.getByPlaceholderText('composer.placeholder');
  expect(screen.getByRole('button', { name: 'composer.send' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '  Hello  ' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(state.send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(state.send).toHaveBeenCalledWith({
    id: 8,
    requestBody: { content: 'Hello', referenceType: MessageReferenceType.RESOURCE, referenceId: 7 },
  });
  const created = { id: 3 };
  act(() => state.success?.(created));
  expect(input).toHaveValue('');
  expect(screen.queryByText('Saw')).toBeNull();
  expect(state.apply).toHaveBeenCalledWith(state.client, created, 1);
});
it('removes pending references and submits a plain reply', () => {
  render(
    <MemoryRouter>
      <MessageThread conversationId={8} currentUserId={1} pendingResourceId={7} />
    </MemoryRouter>,
  );
  expect(screen.getByText('composer.attachedResource')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'composer.removeReference' }));
  fireEvent.change(screen.getByPlaceholderText('composer.placeholder'), { target: { value: 'Plain' } });
  fireEvent.click(screen.getByRole('button', { name: 'composer.send' }));
  expect(state.send).toHaveBeenCalledWith({ id: 8, requestBody: { content: 'Plain' } });
});
it('shows empty threads and prevents duplicate sends while a request is pending', () => {
  state.sending = true;
  render(
    <MemoryRouter>
      <MessageThread conversationId={8} currentUserId={1} />
    </MemoryRouter>,
  );
  expect(screen.getByText('thread.empty')).toBeTruthy();
  const input = screen.getByPlaceholderText('composer.placeholder');
  fireEvent.change(input, { target: { value: 'Draft' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(state.send).not.toHaveBeenCalled();
});
