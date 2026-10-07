// Subscribes to per-user SSE stream and reports system notifications
// FEATURE: System notification preferences
import { useLiveUpdates } from '../../utils/live-updates';

import { SystemNotificationLiveEvent } from '../../utils/live-update-types';
export type { SystemNotificationLiveEvent } from '../../utils/live-update-types';

interface Props {
  onNotification: (notification: SystemNotificationLiveEvent) => void;
  enabled?: boolean;
}

export function useSystemNotificationsLive(props: Props) {
  const { onNotification, enabled = true } = props;

  return useLiveUpdates({
    topic: 'notifications',
    onUpdate: onNotification,
    enabled,
  });
}
