import { Button, Badge } from '@heroui/react';
import { MessageCircle } from 'lucide-react';
import { useAiChatStore } from './ai-chat.store';
import { useAiServiceAiControllerGetStatus } from '@attraccess/react-query-client';

export function AiChatButton() {
  const { toggle, pendingApprovals } = useAiChatStore();
  const { data: status } = useAiServiceAiControllerGetStatus();

  if (!status?.enabled) return null;

  const pendingCount = pendingApprovals.filter((tc) => tc.status === 'pending').length;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Badge content={pendingCount} color="danger" isInvisible={pendingCount === 0}>
        <Button
          isIconOnly
          color="primary"
          size="lg"
          radius="full"
          onPress={toggle}
          className="shadow-lg"
        >
          <MessageCircle size={24} />
        </Button>
      </Badge>
    </div>
  );
}
