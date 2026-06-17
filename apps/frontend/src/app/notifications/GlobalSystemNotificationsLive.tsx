// Global in-app toasts for live system notifications
// FEATURE: System notification preferences
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../components/toastProvider';
import { useAuth } from '../../hooks/useAuth';
import { SystemNotificationLiveEvent, useSystemNotificationsLive } from './useSystemNotificationsLive';
import { useWebPresence } from './useWebPresence';

interface Props {
  enabled?: boolean;
}

export function GlobalSystemNotificationsLive({ enabled = true }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToastMessage();

  const isEnabled = enabled && Boolean(user);

  const handleNotification = useCallback(
    (notification: SystemNotificationLiveEvent) => {
      toast.info({
        title: notification.title,
        description: notification.body,
        duration: 5000,
        ...(notification.url
          ? {
              action: {
                label: 'Open',
                onClick: () => navigate(notification.url as string),
              },
            }
          : {}),
      });
    },
    [navigate, toast],
  );

  useSystemNotificationsLive({
    onNotification: handleNotification,
    enabled: isEnabled,
  });

  useWebPresence(isEnabled);

  return null;
}
