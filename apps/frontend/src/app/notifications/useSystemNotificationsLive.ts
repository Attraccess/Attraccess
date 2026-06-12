// Subscribes to per-user SSE stream and reports system notifications
// FEATURE: System notification preferences
import { useSSE } from '../../utils/sse';

export interface SystemNotificationLiveEvent {
  title: string;
  body?: string;
  url?: string;
}

interface Props {
  onNotification: (notification: SystemNotificationLiveEvent) => void;
  enabled?: boolean;
}

export function useSystemNotificationsLive(props: Props) {
  const { onNotification, enabled = true } = props;

  return useSSE<SystemNotificationLiveEvent>({
    path: '/api/notifications/live',
    onUpdate: onNotification,
    enabled,
  });
}
