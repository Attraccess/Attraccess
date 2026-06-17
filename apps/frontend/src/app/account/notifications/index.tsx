// Per-user notification preferences control for the account page
// FEATURE: Messaging notification preferences
import {
  ApiError,
  NotificationCategory,
  NotificationCategoryPreferenceDto,
  UseNotificationsServiceNotificationsGetPreferencesKeyFn,
  useNotificationsServiceNotificationsGetPreferences,
  useNotificationsServiceNotificationsUpdatePreferences,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type NotificationChannel = 'email' | 'push' | 'toast';

const categoryGroups: Array<{ id: string; categories: NotificationCategory[] }> = [
  {
    id: 'general',
    categories: [
      NotificationCategory.MESSAGES,
      NotificationCategory.RESOURCE_TAKEOVER,
      NotificationCategory.RESOURCE_SESSION_ENDED,
      NotificationCategory.NFC_CARDS,
      NotificationCategory.PROJECT_INVITATIONS,
    ],
  },
  {
    id: 'resourceManagers',
    categories: [
      NotificationCategory.MAINTENANCE_REQUESTS,
      NotificationCategory.RESOURCE_USAGE_NOTES,
      NotificationCategory.RESOURCE_HEALTH,
    ],
  },
  {
    id: 'admins',
    categories: [NotificationCategory.ACCESS_CHANGES],
  },
];

const channels: NotificationChannel[] = ['email', 'push', 'toast'];

function getCategoryPreference(
  preferences: NotificationCategoryPreferenceDto[] | undefined,
  category: NotificationCategory,
): NotificationCategoryPreferenceDto | undefined {
  return preferences?.find((preference) => preference.category === category);
}

export function NotificationPreferencesForm() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: preferences, isLoading } = useNotificationsServiceNotificationsGetPreferences();

  const { mutate } = useNotificationsServiceNotificationsUpdatePreferences({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseNotificationsServiceNotificationsGetPreferencesKeyFn() });
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

  const updateChannel = useCallback(
    (category: NotificationCategory, channel: NotificationChannel, value: boolean) => {
      mutate({ requestBody: { category, channels: { [channel]: value } } });
    },
    [mutate],
  );

  const renderChannelSwitch = (category: NotificationCategory, channel: NotificationChannel) => {
    const preference = getCategoryPreference(preferences?.categories, category);
    const selected = Boolean(preference?.channels[channel]);
    const disabled = isLoading;

    return (
      <LabeledSwitch
        aria-label={`${t(`categories.${category}.label`)} ${t(`columns.${channel}`)}`}
        isSelected={selected}
        isDisabled={disabled}
        onChange={(value) => updateChannel(category, channel, value)}
        data-testid={`notifications-${category}-${channel}`}
        data-cy={`notifications-${category}-${channel}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div data-testid="notification-preferences-mobile" className="flex flex-row gap-4 flex-wrap">
        {categoryGroups.map((group) => {
          return (
            <section key={group.id} data-testid={`notification-group-${group.id}`} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-default-700">{t(`groups.${group.id}.label`)}</h3>
                <p className="text-xs text-default-500">{t(`groups.${group.id}.description`)}</p>
              </div>

              <div
                data-testid={`notification-channel-labels-${group.id}`}
                className="hidden grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))] gap-3 px-3 text-xs font-medium text-default-500 lg:grid"
              >
                <span aria-hidden="true" />
                <span className="text-center">{t('columns.email')}</span>
                <span className="text-center">{t('columns.push')}</span>
                <span className="text-center">{t('columns.toast')}</span>
              </div>

              <div className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-default-200 lg:rounded-lg lg:border lg:border-default-200">
                {group.categories.map((category) => {
                  return (
                    <div
                      key={category}
                      className="rounded-lg border border-default-200 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))] lg:gap-3 lg:rounded-none lg:border-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{t(`categories.${category}.label`)}</span>
                        <span className="text-xs text-default-500">{t(`categories.${category}.description`)}</span>
                      </div>

                      <div className="mt-3 flex flex-col divide-y divide-default-200 lg:contents lg:divide-y-0">
                        {channels.map((channel) => (
                          <div
                            key={channel}
                            className="flex min-h-11 items-center justify-between gap-4 py-2 lg:min-h-0 lg:justify-center lg:py-0"
                          >
                            <span className="text-sm text-default-700 lg:hidden">{t(`columns.${channel}`)}</span>
                            {renderChannelSwitch(category, channel)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-default-500">{t('description.push')}</p>
    </div>
  );
}
