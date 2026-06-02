// Subscribes to per-user SSE stream and reports newly arrived messages
// FEATURE: Messaging inbox live updates
import { Message } from '@attraccess/react-query-client';
import { useSSE } from '../../utils/sse';

interface Props {
  onMessage: (message: Message) => void;
  enabled?: boolean;
}

export function useMessagingLive(props: Props) {
  const { onMessage, enabled = true } = props;

  return useSSE<Message>({
    path: '/api/messaging/live',
    onUpdate: onMessage,
    enabled,
  });
}
