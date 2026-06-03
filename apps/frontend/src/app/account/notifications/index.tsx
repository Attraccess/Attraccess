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
import en from './en.json';
import de from './de.json';

export function NotificationPreferencesForm() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: preferences, isLoading } = useMessagingServiceMessagingGetNotificationPreferences();

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

  const onChange = useCallback(
    (value: boolean) => {
      mutate({ requestBody: { messagesEmailOnOffline: value } });
    },
    [mutate],
  );

  return (
    <LabeledSwitch
      isSelected={preferences?.messagesEmailOnOffline ?? true}
      isDisabled={isLoading || isPending}
      onChange={onChange}
      data-testid="notifications-messages-email-on-offline"
      data-cy="notifications-messages-email-on-offline"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('messagesEmailOnOffline.label')}</span>
        <span className="text-xs text-default-500">{t('messagesEmailOnOffline.description')}</span>
      </div>
    </LabeledSwitch>
  );
}
