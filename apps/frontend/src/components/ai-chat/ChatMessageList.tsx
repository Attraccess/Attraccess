import React, { useEffect, useRef } from 'react';
import { ScrollShadow } from '@heroui/react';
import { ChatMessage } from './ChatMessage';
import { ToolApprovalCard } from './ToolApprovalCard';
import { useAiChatStore } from './ai-chat.store';

interface ChatMessageListProps {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ChatMessageList({ onApprove, onReject }: ChatMessageListProps) {
  const { messages, pendingApprovals } = useAiChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingApprovals]);

  return (
    <ScrollShadow className="flex-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          Start a conversation with the AI assistant
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {pendingApprovals
        .filter((tc) => tc.status === 'pending')
        .map((tc) => (
          <ToolApprovalCard key={tc.id} toolCall={tc} onApprove={onApprove} onReject={onReject} />
        ))}
      <div ref={bottomRef} />
    </ScrollShadow>
  );
}
