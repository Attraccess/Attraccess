// Conversation thread with paginated history and a reply composer
// FEATURE: Messaging thread view and composer
import {
  useMessagingServiceMessagingListMessages,
  useMessagingServiceMessagingSendMessage,
} from '@attraccess/react-query-client';
import { Spinner, TextArea, cn } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SendIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { Button } from '../../components/button';
import { applyIncomingMessage } from './messageCache';

interface Props {
  conversationId: number;
  currentUserId: number;
}

const PAGE_SIZE = 20;

export function MessageThread(props: Props) {
  const { conversationId, currentUserId } = props;

  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useMessagingServiceMessagingListMessages({ id: conversationId, page: 1, limit });

  const messages = useMemo(() => (data ? [...data.data].reverse() : []), [data]);
  const hasOlder = data ? data.total > data.data.length : false;

  const { mutate: sendMessage, isPending: isSending } = useMessagingServiceMessagingSendMessage({
    onSuccess: (created) => {
      setDraft('');
      applyIncomingMessage(queryClient, created);
    },
  });

  const submit = useCallback(() => {
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }
    sendMessage({ id: conversationId, requestBody: { content } });
  }, [conversationId, draft, isSending, sendMessage]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <p className="py-6 text-center text-small text-zinc-500">{t('thread.empty')}</p>
        )}

        {hasOlder && (
          <div className="flex justify-center pb-4">
            <Button variant="ghost" size="sm" onPress={() => setLimit((current) => current + PAGE_SIZE)}>
              {t('thread.loadOlder')}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((message) => {
            const isOwn = message.senderId === currentUserId;
            return (
              <div
                key={message.id}
                className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}
                data-cy={`message-${message.id}`}
              >
                <div
                  className={cn(
                    'max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-small',
                    isOwn
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50',
                  )}
                >
                  {message.content}
                </div>
                <span className="mt-0.5 text-tiny text-zinc-400">
                  {new Date(message.createdAt).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-700"
      >
        <TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('composer.placeholder')}
          data-cy="message-composer-input"
          onKeyDown={handleKeyDown}
          fullWidth
          variant="primary"
          rows={2}
          className="flex-1 resize-none"
        />
        <Button
          type="submit"
          variant="primary"
          isIconOnly
          size="lg"
          isPending={isSending}
          isDisabled={draft.trim().length === 0}
          aria-label={t('composer.send')}
          data-cy="message-send-button"
          className="shrink-0"
        >
          <SendIcon size={18} />
        </Button>
      </form>
    </div>
  );
}
