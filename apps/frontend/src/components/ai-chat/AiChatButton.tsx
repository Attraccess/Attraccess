import { Button } from '@heroui/react';
import { MessageCircle } from 'lucide-react';
import { useAiChatStore } from './ai-chat.store';
import { useAiServiceAiControllerGetStatus } from '@attraccess/react-query-client';

export function AiChatButton() {
  const toggle = useAiChatStore((s) => s.toggle);
  const { data: status } = useAiServiceAiControllerGetStatus();

  if (!status?.enabled) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        isIconOnly
        color="primary"
        size="lg"
        radius="full"
        onPress={toggle}
        className="shadow-lg"
        data-testid="ai-chat-open"
      >
        <MessageCircle size={24} />
      </Button>
    </div>
  );
}
