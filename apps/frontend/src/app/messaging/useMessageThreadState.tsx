import {
  MessageReferenceType,
  useMessagingServiceMessagingListMessages,
  useMessagingServiceMessagingSendMessage,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { applyIncomingMessage } from './messageCache';
import { Props } from './MessageThread.props';
import { PAGE_SIZE } from './MessageThread.page-size';
export function useMessageThreadState(props: Props) {
  const { conversationId, currentUserId, pendingResourceId } = props;

  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [attachedResourceId, setAttachedResourceId] = useState<number | undefined>(pendingResourceId);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAttachedResourceId(pendingResourceId);
  }, [pendingResourceId, conversationId]);

  const { data: attachedResource } = useResourcesServiceGetOneResourceById(
    { id: attachedResourceId as number },
    undefined,
    { enabled: !!attachedResourceId },
  );

  const { data, isLoading } = useMessagingServiceMessagingListMessages({ id: conversationId, page: 1, limit });

  const messages = useMemo(() => (data ? [...data.data].reverse() : []), [data]);
  const hasOlder = data ? data.total > data.data.length : false;

  const { mutate: sendMessage, isPending: isSending } = useMessagingServiceMessagingSendMessage({
    onSuccess: (created) => {
      setDraft('');
      setAttachedResourceId(undefined);
      applyIncomingMessage(queryClient, created, currentUserId);
    },
  });

  const submit = useCallback(() => {
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }
    sendMessage({
      id: conversationId,
      requestBody: attachedResourceId
        ? { content, referenceType: MessageReferenceType.RESOURCE, referenceId: attachedResourceId }
        : { content },
    });
  }, [attachedResourceId, conversationId, draft, isSending, sendMessage]);

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

  // The mobile keyboard shrinks the thread without moving its scroll position,
  // which would strand the newest message off screen.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const scrollToBottom = () => bottomRef.current?.scrollIntoView({ block: 'end' });
    viewport.addEventListener('resize', scrollToBottom);
    return () => viewport.removeEventListener('resize', scrollToBottom);
  }, []);
  return {
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
  } as const;
}
