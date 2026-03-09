import React, { useEffect, useState } from 'react';
import { Button, Badge } from '@heroui/react';
import { MessageCircle } from 'lucide-react';
import { useAiChatStore } from './ai-chat.store';
import { getBaseUrl } from '../../api';

export function AiChatButton() {
  const { toggle, pendingApprovals } = useAiChatStore();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAiStatus = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/ai/status`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setAiEnabled(data.enabled && data.ollamaConnected);
        }
      } catch {
        setAiEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAiStatus();
  }, []);

  if (isLoading || !aiEnabled) return null;

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
