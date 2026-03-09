import React, { useCallback } from 'react';
import { Button, Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAiChatStore } from './ai-chat.store';
import { useAiChat } from './useAiChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import en from './translations/en.json';
import de from './translations/de.json';

export function AiChatPanel() {
  const { isOpen, setOpen, isStreaming, clear } = useAiChatStore();
  const { sendMessage, approveActions, rejectAction } = useAiChat();
  const { t } = useTranslations({ en, de });

  const handleApprove = useCallback(
    (id: string) => {
      approveActions([id]);
    },
    [approveActions],
  );

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={setOpen}
      placement="right"
      size="md"
      hideCloseButton={false}
    >
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <span>{t('aiChat.title')}</span>
          <Button isIconOnly size="sm" variant="light" onPress={handleClear} aria-label={t('aiChat.clear')}>
            <Trash2 size={16} />
          </Button>
        </DrawerHeader>
        <DrawerBody className="p-0">
          <ChatMessageList onApprove={handleApprove} onReject={rejectAction} />
        </DrawerBody>
        <DrawerFooter className="p-0">
          <ChatInput
            onSend={sendMessage}
            disabled={isStreaming}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
