import { Chip, Link } from '@heroui/react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ConversationListItemDto,
  useMessagingServiceMessagingGetUnreadCount,
  useMessagingServiceMessagingListConversations,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { BigNumber, itemsPerSize, WidgetEmpty, WidgetError, WidgetList, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const CONVERSATIONS_PER_SIZE = { medium: 3, large: 7 };

const countLabel = (count: number) => (count > 99 ? '99+' : count);

// A chip is a plain span, whose aria-label screen readers skip; the count is spoken from hidden text instead.
function UnreadChip({ count }: Readonly<{ count: number }>) {
  const { t } = useTranslations({ en, de });
  return (
    <Chip size="sm" color="accent" variant="primary">
      <span aria-hidden>{countLabel(count)}</span>
      <span className="sr-only">{t('messages.unread', { count })}</span>
    </Chip>
  );
}

/** The total unread count, the same as the sidebar badge. GlobalMessagingLive keeps it current. */
export function MessagesUnreadChip({ size }: Readonly<Partial<DashboardWidgetRenderProps>>) {
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();
  // A small tile shows the count as its content already.
  if (!unread?.total || size === 'small') return null;

  return <UnreadChip count={unread.total} />;
}

function ConversationRow({ conversation }: Readonly<{ conversation: ConversationListItemDto }>) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const name = conversation.otherParticipant?.username ?? t('messages.unknownUser');

  return (
    <li>
      <Link
        href={`/messages?conversation=${conversation.id}`}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg no-underline"
        data-cy="dashboard-messages-conversation"
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-default text-xs font-medium uppercase">
          <span aria-hidden>{name.charAt(0)}</span>
          {conversation.otherParticipantOnline && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success"
              role="img"
              aria-label={t('messages.online')}
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium leading-tight text-foreground">{name}</span>
            {conversation.lastMessage && (
              <span className="shrink-0 text-xs text-muted">{formatDateTime(conversation.lastMessage.createdAt)}</span>
            )}
          </span>
          <span className="truncate text-xs text-muted">
            {conversation.lastMessage?.content ?? t('messages.noMessages')}
          </span>
        </span>
        {conversation.unreadCount > 0 && <UnreadChip count={conversation.unreadCount} />}
      </Link>
    </li>
  );
}

/** Small: the unread count as a big number and who last wrote to the user. */
function UnreadSummary({ conversations }: Readonly<{ conversations: ConversationListItemDto[] }>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();
  // Skips conversations where the user's own reply is the latest message.
  const latest = conversations.find(
    (conversation) => conversation.lastMessage && conversation.lastMessage.senderId !== user?.id,
  )?.otherParticipant?.username;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BigNumber value={unread?.total ?? 0} label={t('messages.unreadLabel')} data-cy="dashboard-messages-unread" />
      {latest && <span className="truncate text-xs text-muted">{t('messages.latestFrom', { name: latest })}</span>}
    </div>
  );
}

/**
 * Small: the unread count and the latest sender. Medium and large: the latest 3 or 7 conversations, each opening its
 * thread. The messaging caches keep both live.
 */
export function MessagesWidget({ size }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const { data: conversations, isPending, isError } = useMessagingServiceMessagingListConversations();

  if (isPending) return <WidgetLoading />;
  if (isError || !conversations) return <WidgetError title={t('loadError')} />;
  if (size === 'small') return <UnreadSummary conversations={conversations} />;
  if (conversations.length === 0) return <WidgetEmpty>{t('messages.empty')}</WidgetEmpty>;
  return (
    <WidgetList>
      {conversations.slice(0, itemsPerSize(size, CONVERSATIONS_PER_SIZE)).map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} />
      ))}
    </WidgetList>
  );
}
