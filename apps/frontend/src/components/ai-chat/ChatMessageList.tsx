import React, { useEffect, useRef } from 'react';
import { ScrollShadow, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChatMessage } from './ChatMessage';
import { ToolApprovalCard } from './ToolApprovalCard';
import { useAiChatStore } from './ai-chat.store';
import en from './translations/en.json';
import de from './translations/de.json';

interface ChatMessageListProps {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ChatMessageList({ onApprove, onReject }: ChatMessageListProps) {
  const { messages, pendingApprovals, isStreaming } = useAiChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslations({ en, de });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingApprovals, isStreaming]);

  const lastMessage = messages[messages.length - 1];
  const isThinking = isStreaming && (!lastMessage || lastMessage.role === 'user');

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
      {isThinking && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Spinner size="sm" color="primary" />
          <span className="text-sm text-default-500">{t('aiChat.thinking')}</span>
        </div>
      )}
      {lastMessage?.isStreaming && (
        <div className="flex items-center gap-1 mb-1 px-1">
          <span className="text-xs text-default-400 animate-pulse">{t('aiChat.streaming')}</span>
        </div>
      )}
      {pendingApprovals
        .filter((tc) => tc.status === 'pending')
        .map((tc) => (
          <ToolApprovalCard key={tc.id} toolCall={tc} onApprove={onApprove} onReject={onReject} />
        ))}
      <div ref={bottomRef} />
    </ScrollShadow>
  );
}
