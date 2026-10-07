// Conversation thread with paginated history and a reply composer
// FEATURE: Messaging thread view and composer
import { Spinner, TextArea, cn } from '@heroui/react';
import { Link } from 'react-router-dom';
import { SendIcon, BoxIcon, XIcon } from 'lucide-react';
import { Button } from '../../components/button';
import { Props } from './MessageThread.props';
import { PAGE_SIZE } from './MessageThread.page-size';
import { useMessageThreadState } from './useMessageThreadState';

export function MessageThread(props: Props) {
  const {
    currentUserId,
    t,
    draft,
    setDraft,
    setLimit,
    attachedResourceId,
    setAttachedResourceId,
    bottomRef,
    attachedResource,
    isLoading,
    messages,
    hasOlder,
    isSending,
    handleSubmit,
    handleKeyDown,
  } = useMessageThreadState(props);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <p className="py-6 text-center text-small text-muted">{t('thread.empty')}</p>
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
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-surface-secondary text-surface-secondary-foreground',
                  )}
                >
                  {message.content}
                </div>
                {message.referenceLabel && (
                  <Link
                    to={message.referenceUrl ?? '#'}
                    className={cn(
                      'mt-1 inline-flex max-w-[75%] items-center gap-1 rounded-lg border px-2 py-1 text-tiny',
                      'border-border bg-surface-secondary text-surface-secondary-foreground hover:bg-surface-tertiary',
                    )}
                    data-cy={`message-reference-${message.id}`}
                  >
                    <BoxIcon size={12} className="shrink-0" />
                    <span className="truncate">{message.referenceLabel}</span>
                  </Link>
                )}
                <span className="mt-0.5 text-tiny text-muted">{new Date(message.createdAt).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {attachedResourceId && (
        <div className="flex items-center gap-2 border-t border-border px-3 pt-2">
          <span
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-secondary px-2 py-1 text-tiny text-surface-secondary-foreground"
            data-cy="composer-resource-reference"
          >
            <BoxIcon size={12} className="shrink-0" />
            <span className="truncate">{attachedResource?.name ?? t('composer.attachedResource')}</span>
            <button
              type="button"
              onClick={() => setAttachedResourceId(undefined)}
              aria-label={t('composer.removeReference')}
              data-cy="composer-remove-reference"
              className="ml-0.5 rounded p-0.5 hover:bg-surface-tertiary"
            >
              <XIcon size={12} />
            </button>
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn('flex items-end gap-2 p-3', attachedResourceId ? '' : 'border-t border-border')}
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
