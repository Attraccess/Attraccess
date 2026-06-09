// Per-user notification preferences control for the account page
// FEATURE: Messaging notification preferences
import {
  ApiError,
  useMessagingServiceMessagingGetNotificationPreferences,
  useMessagingServiceMessagingGetNotificationPreferencesKey,
  useMessagingServiceMessagingUpdateNotificationPreferences,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { useToastMessage } from '../../../components/toastProvider';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import en from './en.json';
import de from './de.json';

export function NotificationPreferencesForm() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: preferences, isLoading } = useMessagingServiceMessagingGetNotificationPreferences();
  const push = usePushNotifications();

  const { mutate, isPending } = useMessagingServiceMessagingUpdateNotificationPreferences({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useMessagingServiceMessagingGetNotificationPreferencesKey] });
      showSuccess({ title: t('messages.updated') });
    },
    onError: (rawError) => {
      let messageToDisplay = t('errors.updateFailed');
      if (rawError instanceof ApiError) {
        const body = rawError.body as { message?: string | string[] } | undefined;
        const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          messageToDisplay = msg;
        }
      }
      showError({ title: messageToDisplay });
    },
  });

  const onEmailChange = useCallback(
    (value: boolean) => {
      mutate({ requestBody: { messagesEmailOnOffline: value } });
    },
    [mutate],
  );

  const onPushChange = useCallback(
    async (value: boolean) => {
      if (value) {
        const subscribed = await push.subscribe().catch(() => false);
        if (!subscribed) {
          showError({ title: t('messagesPush.errors.subscribeFailed') });
          return;
        }
        mutate({ requestBody: { messagesPushEnabled: true } });
        return;
      }

      await push.unsubscribe().catch(() => undefined);
      mutate({ requestBody: { messagesPushEnabled: false } });
    },
    [mutate, push, showError, t],
  );

  const pushUnavailable = !push.isSupported || !push.isPushConfigured;
  const pushBlocked = push.isSupported && push.permission === 'denied';

  let pushDescription = t('messagesPush.description');
  if (!push.isSupported) {
    pushDescription = t('messagesPush.unsupported');
  } else if (!push.isPushConfigured && !push.isLoadingKey) {
    pushDescription = t('messagesPush.notConfigured');
  } else if (pushBlocked) {
    pushDescription = t('messagesPush.permissionDenied');
  }

  return (
    <div className="flex flex-col gap-4">
      <LabeledSwitch
        isSelected={preferences?.messagesEmailOnOffline ?? true}
        isDisabled={isLoading || isPending}
        onChange={onEmailChange}
        data-testid="notifications-messages-email-on-offline"
        data-cy="notifications-messages-email-on-offline"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('messagesEmailOnOffline.label')}</span>
          <span className="text-xs text-default-500">{t('messagesEmailOnOffline.description')}</span>
        </div>
      </LabeledSwitch>

      <LabeledSwitch
        isSelected={(preferences?.messagesPushEnabled ?? true) && push.isSubscribed && push.permission === 'granted'}
        isDisabled={isLoading || isPending || push.isBusy || push.isLoadingKey || pushUnavailable || pushBlocked}
        onChange={onPushChange}
        data-testid="notifications-messages-push-enabled"
        data-cy="notifications-messages-push-enabled"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('messagesPush.label')}</span>
          <span className="text-xs text-default-500">{pushDescription}</span>
        </div>
      </LabeledSwitch>
    </div>
  );
}
