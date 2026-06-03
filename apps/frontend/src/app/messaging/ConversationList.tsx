// Inbox list of conversations showing the other participant and last message
// FEATURE: Messaging inbox conversation list
import { ConversationListItemDto } from '@attraccess/react-query-client';
import { Chip, Skeleton, cn } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { EmptyState } from '../../components/emptyState';

interface Props {
  conversations?: ConversationListItemDto[];
  isLoading: boolean;
  selectedConversationId: number | null;
  onSelect: (conversationId: number) => void;
}

export function ConversationList(props: Props) {
  const { conversations, isLoading, selectedConversationId, onSelect } = props;

  const { t } = useTranslations({ en, de });

  if (isLoading && !conversations) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <Skeleton className="h-16 w-full rounded-medium" />
        <Skeleton className="h-16 w-full rounded-medium" />
        <Skeleton className="h-16 w-full rounded-medium" />
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return <EmptyState message={t('conversations.empty')} />;
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conversation) => {
        const username = conversation.otherParticipant?.username ?? t('conversations.unknownUser');
        const preview = conversation.lastMessage?.content ?? t('conversations.noMessages');
        const unreadCount = conversation.unreadCount ?? 0;
        const hasUnread = unreadCount > 0;

        return (
          <button
            key={conversation.id}
            type="button"
            data-cy={`conversation-item-${conversation.id}`}
            onClick={() => onSelect(conversation.id)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
              selectedConversationId === conversation.id && 'bg-zinc-100 dark:bg-zinc-800',
            )}
          >
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-small font-medium uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                {username.charAt(0)}
              </div>
              {conversation.otherParticipantOnline && (
                <span
                  data-cy={`conversation-online-${conversation.id}`}
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-zinc-900"
                  aria-label={t('conversations.online')}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{username}</p>
                {conversation.lastMessage && (
                  <span className="shrink-0 text-tiny text-zinc-400">
                    {new Date(conversation.lastMessage.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={cn('truncate text-small', hasUnread ? 'font-medium text-foreground' : 'text-zinc-500')}>
                  {preview}
                </p>
                {hasUnread && (
                  <Chip
                    color="accent"
                    variant="primary"
                    size="sm"
                    className="ml-auto shrink-0"
                    data-cy={`conversation-unread-badge-${conversation.id}`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Chip>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
