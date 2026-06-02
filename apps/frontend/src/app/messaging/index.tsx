// Inbox page combining conversation list, thread view and live SSE updates
// FEATURE: Messaging inbox page
import {
  Message,
  useMessagingServiceMessagingListConversations,
} from '@attraccess/react-query-client';
import { Card, cn } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MailIcon, ArrowLeftIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../components/pageHeader';
import { Button } from '../../components/button';
import { useAuth } from '../../hooks/useAuth';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { useMessagingLive } from './useMessagingLive';
import { applyIncomingMessage } from './messageCache';

export function MessagesPage() {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
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

  const handleLiveMessage = useCallback(
    (message: Message) => {
      applyIncomingMessage(queryClient, message);
    },
    [queryClient],
  );

  useMessagingLive({ onMessage: handleLiveMessage });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MailIcon />} />

      <Card className="overflow-hidden">
        <div className="grid h-[calc(100vh-13rem)] min-h-[28rem] grid-cols-1 lg:h-[70vh] lg:grid-cols-[320px_1fr]">
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
              onSelect={setSelectedConversationId}
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
                    onPress={() => setSelectedConversationId(null)}
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
                  <MessageThread conversationId={selectedConversationId} currentUserId={user.id} />
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
