// Inbox page combining conversation list, thread view and live SSE updates
// FEATURE: Messaging inbox page
import {
  Message,
  UseMessagingServiceMessagingListConversationsKeyFn,
  UseMessagingServiceMessagingListMessagesKeyFn,
  useMessagingServiceMessagingListConversations,
} from '@attraccess/react-query-client';
import { Card } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../components/pageHeader';
import { useAuth } from '../../hooks/useAuth';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { useMessagingLive } from './useMessagingLive';

export function MessagesPage() {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  const { data: conversations, isLoading } = useMessagingServiceMessagingListConversations();

  const handleLiveMessage = useCallback(
    (message: Message) => {
      queryClient.invalidateQueries({ queryKey: UseMessagingServiceMessagingListConversationsKeyFn() });
      queryClient.invalidateQueries({
        queryKey: UseMessagingServiceMessagingListMessagesKeyFn({ id: message.conversationId }),
      });
    },
    [queryClient],
  );

  useMessagingLive({ onMessage: handleLiveMessage });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MailIcon />} />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-[70vh]">
          <div className="overflow-y-auto border-b border-zinc-200 dark:border-zinc-700 md:border-b-0 md:border-r">
            <ConversationList
              conversations={conversations}
              isLoading={isLoading}
              selectedConversationId={selectedConversationId}
              onSelect={setSelectedConversationId}
            />
          </div>

          <div className="min-h-0">
            {selectedConversationId && user ? (
              <MessageThread conversationId={selectedConversationId} currentUserId={user.id} />
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
