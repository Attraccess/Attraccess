// Subscribes to per-user SSE stream and reports newly arrived messages
// FEATURE: Messaging inbox live updates
import { Message } from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../utils/live-updates';

interface Props {
  onMessage: (message: Message) => void;
  enabled?: boolean;
}

export function useMessagingLive(props: Props) {
  const { onMessage, enabled = true } = props;

  return useLiveUpdates({
    topic: 'messaging',
    onUpdate: onMessage,
    enabled,
  });
}
