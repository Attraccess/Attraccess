import { Chip, Link } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ConversationListItemDto,
  useMessagingServiceMessagingGetUnreadCount,
  useMessagingServiceMessagingListConversations,
} from '@attraccess/react-query-client';
import { WidgetEmpty, WidgetError, WidgetLinkButton, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const MAX_CONVERSATIONS = 5;

const countLabel = (count: number) => (count > 99 ? '99+' : count);

/** The total unread count, the same as the sidebar badge. GlobalMessagingLive keeps it current. */
export function MessagesUnreadChip() {
  const { t } = useTranslations({ en, de });
  const { data: unread } = useMessagingServiceMessagingGetUnreadCount();
  if (!unread?.total) return null;

  return (
    <Chip size="sm" color="accent" variant="primary" aria-label={t('messages.unread', { count: unread.total })}>
      {countLabel(unread.total)}
    </Chip>
  );
}

function ConversationRow({ conversation }: Readonly<{ conversation: ConversationListItemDto }>) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const name = conversation.otherParticipant?.username ?? t('messages.unknownUser');

  return (
    <li>
      <Link
        href={`/messages?conversation=${conversation.id}`}
        className="flex w-full items-center gap-3 rounded-lg py-1 no-underline"
        data-cy="dashboard-messages-conversation"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-default text-sm font-medium uppercase">
          {name.charAt(0)}
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
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {conversation.lastMessage && (
              <span className="shrink-0 text-xs text-muted">{formatDateTime(conversation.lastMessage.createdAt)}</span>
            )}
          </span>
          <span className="truncate text-xs text-muted">
            {conversation.lastMessage?.content ?? t('messages.noMessages')}
          </span>
        </span>
        {conversation.unreadCount > 0 && (
          <Chip
            size="sm"
            color="accent"
            variant="primary"
            aria-label={t('messages.unread', { count: conversation.unreadCount })}
          >
            {countLabel(conversation.unreadCount)}
          </Chip>
        )}
      </Link>
    </li>
  );
}

/** The latest conversations, each opening its thread. The messaging caches keep the list live. */
export function MessagesWidget() {
  const { t } = useTranslations({ en, de });
  const { data: conversations, isPending, isError } = useMessagingServiceMessagingListConversations();

  const renderList = () => {
    if (isPending) return <WidgetLoading />;
    if (isError || !conversations) return <WidgetError title={t('loadError')} />;
    if (conversations.length === 0) return <WidgetEmpty>{t('messages.empty')}</WidgetEmpty>;
    return (
      <ul className="flex flex-col gap-1">
        {conversations.slice(0, MAX_CONVERSATIONS).map((conversation) => (
          <ConversationRow key={conversation.id} conversation={conversation} />
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {renderList()}
      <div>
        <WidgetLinkButton href="/messages" data-cy="dashboard-messages-open-inbox">
          {t('messages.openInbox')}
        </WidgetLinkButton>
      </div>
    </div>
  );
}
