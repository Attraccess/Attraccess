import { useCallback } from 'react';
import { Button, Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Spinner } from '@heroui/react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAiChatStore } from './ai-chat.store';
import { useAiChat } from './useAiChat';
import { useActiveConversation } from './useActiveConversation';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import en from './translations/en.json';
import de from './translations/de.json';
import { useAiServiceAiControllerGetStatus } from '@attraccess/react-query-client';

function AiChatContent({ chatId, initialMessages }: { chatId: string; initialMessages: import('ai').UIMessage[] }) {
  const { clear } = useAiChatStore();
  const chat = useAiChat(chatId, initialMessages);
  const { t } = useTranslations({ en, de });
  const { isOpen } = useAiChatStore();
  const { data: status } = useAiServiceAiControllerGetStatus(undefined, {
    enabled: isOpen,
    refetchInterval: 3000,
  });

  const isBusy = chat.status === 'submitted' || chat.status === 'streaming';

  const handleSend = useCallback(
    (text: string) => {
      chat.sendMessage({ text });
    },
    [chat],
  );

  const handleClear = useCallback(async () => {
    const convId = useAiChatStore.getState().conversationId;
    chat.setMessages([]);
    clear();
    if (convId) {
      try {
        await fetch(`/api/ai/chat/${convId}`, { method: 'DELETE', credentials: 'include' });
      } catch { /* ignore */ }
    }
  }, [chat, clear]);

  const notReady = status && (!status.ollamaConnected || !status.modelsReady);

  return (
    <>
      <DrawerHeader className="flex items-center justify-between">
        <span>{t('aiChat.title')}</span>
        <Button isIconOnly size="sm" variant="light" onPress={handleClear} aria-label={t('aiChat.clear')}>
          <Trash2 size={16} />
        </Button>
      </DrawerHeader>
      <DrawerBody className="p-0">
        {notReady && (
          <div className="px-4 py-3 bg-warning-50 dark:bg-warning-900/20 border-b border-warning-200 dark:border-warning-800">
            <div className="flex items-center gap-2 text-sm text-warning-700 dark:text-warning-300">
              {status.modelsPulling ? (
                <>
                  <Spinner size="sm" />
                  <div>
                    <p className="font-medium">{t('aiChat.downloadingModels')}</p>
                    {status.pullProgress && Object.entries(status.pullProgress).map(([model, progress]) => (
                      <p key={model} className="text-xs mt-1">{model}: {String(progress)}</p>
                    ))}
                  </div>
                </>
              ) : !status.ollamaConnected ? (
                <p>{t('aiChat.ollamaNotReachable')}</p>
              ) : (
                <>
                  <Spinner size="sm" />
                  <p>{t('aiChat.preparingModels')}</p>
                </>
              )}
            </div>
          </div>
        )}
        <ChatMessageList
          messages={chat.messages}
          isLoading={chat.status === 'submitted'}
        />
      </DrawerBody>
      <DrawerFooter className="flex flex-col p-0">
        {chat.error && (
          <div className="px-3 py-2 bg-danger-50 dark:bg-danger-900/20 border-t border-danger-200 dark:border-danger-800">
            <div className="flex items-start gap-2 text-sm text-danger-700 dark:text-danger-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{t('aiChat.error')}</p>
                <p className="text-xs mt-0.5 break-words">{chat.error.message}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" color="danger" variant="flat" onPress={() => chat.reload()}>
                  {t('aiChat.retry')}
                </Button>
              </div>
            </div>
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={isBusy || !!notReady}
        />
      </DrawerFooter>
    </>
  );
}

export function AiChatPanel() {
  const { isOpen, setOpen } = useAiChatStore();
  const { loading, chatId, initialMessages } = useActiveConversation();

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={setOpen}
      placement="right"
      size="md"
      hideCloseButton={false}
    >
      <DrawerContent>
        {loading ? (
          <DrawerBody className="flex items-center justify-center">
            <Spinner size="lg" />
          </DrawerBody>
        ) : (
          <AiChatContent chatId={chatId} initialMessages={initialMessages} />
        )}
      </DrawerContent>
    </Drawer>
  );
}
