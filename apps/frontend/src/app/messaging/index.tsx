// Inbox page combining conversation list, thread view and live SSE updates
// FEATURE: Messaging inbox page
import {
  useMessagingServiceMessagingListConversations,
  useMessagingServiceMessagingMarkConversationRead,
} from '@attraccess/react-query-client';
import { Card, cn } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MailIcon, ArrowLeftIcon, Settings2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../components/pageHeader';
import { Button } from '../../components/button';
import { useAuth } from '../../hooks/useAuth';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { markConversationReadInCache } from './messageCache';

export function MessagesPage() {
  const { t } = useTranslations({ en, de });
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = Number(searchParams.get('conversation'));
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(
    Number.isInteger(conversationParam) && conversationParam > 0 ? conversationParam : null,
  );

  useEffect(() => {
    if (Number.isInteger(conversationParam) && conversationParam > 0) {
      setSelectedConversationId(conversationParam);
    }
  }, [conversationParam]);

  const { data: conversations, isLoading } = useMessagingServiceMessagingListConversations();

  const selectedConversation = conversations?.find((conversation) => conversation.id === selectedConversationId);
  const partnerName = selectedConversation?.otherParticipant?.username ?? t('conversations.unknownUser');

  const deepLinkResourceId = Number(searchParams.get('resourceRef'));
  const pendingResourceId =
    Number.isFinite(deepLinkResourceId) && deepLinkResourceId > 0 && selectedConversationId === conversationParam
      ? deepLinkResourceId
      : undefined;

  const { mutate: markConversationRead } = useMessagingServiceMessagingMarkConversationRead();

  const markRead = useCallback(
    (conversationId: number) => {
      markConversationRead(
        { id: conversationId },
        {
          onSuccess: ({ total }) => markConversationReadInCache(queryClient, conversationId, total),
        },
      );
    },
    [markConversationRead, queryClient],
  );

  useEffect(() => {
    if (selectedConversationId && user) {
      markRead(selectedConversationId);
    }
  }, [selectedConversationId, user, markRead]);

  const selectConversation = useCallback(
    (conversationId: number | null) => {
      setSelectedConversationId(conversationId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (conversationId) {
          next.set('conversation', String(conversationId));
          next.delete('resourceRef');
        } else {
          next.delete('conversation');
          next.delete('resourceRef');
        }
        return next;
      });
    },
    [setSearchParams],
  );

  // Fills the scroll container exactly rather than guessing viewport math, so the
  // composer stays on screen when the mobile keyboard shrinks the visible area.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* On phones an open thread needs every pixel — the keyboard leaves ~430px. */}
      <div className={cn(selectedConversationId ? 'hidden lg:block' : 'block')}>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<MailIcon />}
          actions={
            hasPermission('system.settings.manage')
              ? [{ key: 'settings', label: t('settingsButton'), icon: <Settings2Icon size={16} />, onPress: () => navigate('/messages/settings') }]
              : undefined
          }
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_1fr]">
          <div
            className={cn(
              'overflow-y-auto border-zinc-200 dark:border-zinc-700 lg:border-r',
              selectedConversationId ? 'hidden lg:block' : 'block',
            )}
          >
            <ConversationList
              conversations={conversations}
              isLoading={isLoading}
              selectedConversationId={selectedConversationId}
              onSelect={selectConversation}
            />
          </div>

          <div className={cn('min-h-0', selectedConversationId ? 'flex flex-col' : 'hidden lg:flex')}>
            {selectedConversationId && user ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-2 border-b border-zinc-200 p-2 dark:border-zinc-700">
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    className="lg:hidden"
                    onPress={() => selectConversation(null)}
                    aria-label={t('thread.back')}
                    data-cy="thread-back-button"
                  >
                    <ArrowLeftIcon size={18} />
                  </Button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-small font-medium uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                    {partnerName.charAt(0)}
                  </div>
                  <p className="truncate font-medium" data-cy="thread-partner-name">
                    {partnerName}
                  </p>
                </div>
                <div className="min-h-0 flex-1">
                  <MessageThread
                    conversationId={selectedConversationId}
                    currentUserId={user.id}
                    pendingResourceId={pendingResourceId}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-small text-zinc-500">
                {t('thread.selectPrompt')}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default MessagesPage;
