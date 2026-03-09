import { useCallback } from 'react';
import { Button, Spinner } from '@heroui/react';
import { X, Trash2 } from 'lucide-react';
import { useAiChatStore } from './ai-chat.store';
import { useAiChat } from './useAiChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { useAiServiceAiControllerGetStatus } from '@attraccess/react-query-client';

export function AiChatPanel() {
  const { isOpen, setOpen, isStreaming, clear } = useAiChatStore();
  const { sendMessage, approveActions, rejectAction } = useAiChat();
  const { data: status } = useAiServiceAiControllerGetStatus(undefined, {
    enabled: isOpen,
    refetchInterval: 3000,
  });

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

  const notReady = status && (!status.ollamaConnected || !status.modelsReady);

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

      {notReady && (
        <div className="px-4 py-3 bg-warning-50 dark:bg-warning-900/20 border-b border-warning-200 dark:border-warning-800">
          <div className="flex items-center gap-2 text-sm text-warning-700 dark:text-warning-300">
            {status.modelsPulling ? (
              <>
                <Spinner size="sm" />
                <div>
                  <p className="font-medium">Downloading AI models...</p>
                  {status.pullProgress && Object.entries(status.pullProgress).map(([model, progress]) => (
                    <p key={model} className="text-xs mt-1">{model}: {progress}</p>
                  ))}
                </div>
              </>
            ) : !status.ollamaConnected ? (
              <p>Ollama is not reachable. Please ensure it is running.</p>
            ) : (
              <>
                <Spinner size="sm" />
                <p>Preparing AI models...</p>
              </>
            )}
          </div>
        </div>
      )}

      <ChatMessageList onApprove={handleApprove} onReject={rejectAction} />

      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming || !!notReady}
        placeholder={notReady ? 'Waiting for AI models...' : 'Ask me anything about Attraccess...'}
      />
    </div>
  );
}
