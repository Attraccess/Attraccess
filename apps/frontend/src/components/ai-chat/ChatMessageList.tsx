import React, { useEffect, useRef } from 'react';
import { ScrollShadow, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { UIMessage } from 'ai';
import { ChatMessage } from './ChatMessage';
import en from './translations/en.json';
import de from './translations/de.json';

interface ChatMessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function ChatMessageList({ messages, isLoading }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslations({ en, de });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <ScrollShadow className="flex-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-default-400 text-sm">
          {t('aiChat.emptyState')}
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Spinner size="sm" color="primary" />
          <span className="text-sm text-default-500">{t('aiChat.connecting')}</span>
        </div>
      )}
      <div ref={bottomRef} />
    </ScrollShadow>
  );
}
