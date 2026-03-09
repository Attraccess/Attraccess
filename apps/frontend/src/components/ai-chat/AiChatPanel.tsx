import React, { useCallback } from 'react';
import { Button } from '@heroui/react';
import { X, Trash2 } from 'lucide-react';
import { useAiChatStore } from './ai-chat.store';
import { useAiChat } from './useAiChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

export function AiChatPanel() {
  const { isOpen, setOpen, isStreaming, clear } = useAiChatStore();
  const { sendMessage, approveActions, rejectAction } = useAiChat();

  const handleApprove = useCallback(
    (id: string) => {
      approveActions([id]);
    },
    [approveActions],
  );

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] z-50 flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Assistant</h2>
        <div className="flex gap-1">
          <Button isIconOnly size="sm" variant="light" onPress={handleClear}>
            <Trash2 size={16} />
          </Button>
          <Button isIconOnly size="sm" variant="light" onPress={() => setOpen(false)}>
            <X size={16} />
          </Button>
        </div>
      </div>

      <ChatMessageList onApprove={handleApprove} onReject={rejectAction} />

      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming}
        placeholder="Ask me anything about Attraccess..."
      />
    </div>
  );
}
