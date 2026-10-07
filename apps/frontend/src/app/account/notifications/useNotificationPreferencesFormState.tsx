import {
  ApiError,
  NotificationCategory,
  UseNotificationsServiceNotificationsGetPreferencesKeyFn,
  useLicenseServiceGetLicenseInformation,
  useNotificationsServiceNotificationsGetPreferences,
  useNotificationsServiceNotificationsUpdatePreferences,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';
import { NotificationChannel } from './index.notification-channel';
import { channels } from './index.channels';
import { getCategoryPreference } from './index.get-category-preference';
export function useNotificationPreferencesFormState() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const { success: showSuccess, error: showError } = useToastMessage();
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const hasMaintenance = license?.modules.includes('maintenance') ?? true;
  const isBulkUpdatingRef = useRef(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const categoryGroups = useMemo(
    () => [
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
          ...(hasMaintenance ? [NotificationCategory.MAINTENANCE_REQUESTS] : []),
          NotificationCategory.RESOURCE_USAGE_NOTES,
          NotificationCategory.RESOURCE_HEALTH,
        ],
      },
      {
        id: 'admins',
        categories: [NotificationCategory.ACCESS_CHANGES],
      },
    ],
    [hasMaintenance],
  );

  const { data: preferences, isLoading } = useNotificationsServiceNotificationsGetPreferences();

  const { mutate, mutateAsync } = useNotificationsServiceNotificationsUpdatePreferences({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseNotificationsServiceNotificationsGetPreferencesKeyFn() });
      if (!isBulkUpdatingRef.current) showSuccess({ title: t('messages.updated') });
    },
    onError: (rawError) => {
      if (!isBulkUpdatingRef.current) {
        let messageToDisplay = t('errors.updateFailed');
        if (rawError instanceof ApiError) {
          const body = rawError.body as { message?: string | string[] } | undefined;
          const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
          if (typeof msg === 'string' && msg.trim().length > 0) {
            messageToDisplay = msg;
          }
        }
        showError({ title: messageToDisplay });
      }
    },
  });

  const updateChannel = useCallback(
    (category: NotificationCategory, channel: NotificationChannel, value: boolean) => {
      mutate({ requestBody: { category, channels: { [channel]: value } } });
    },
    [mutate],
  );

  const toggleCategory = useCallback(
    (category: NotificationCategory, value: boolean) => {
      mutate({ requestBody: { category, channels: { email: value, push: value, toast: value } } });
    },
    [mutate],
  );

  const runBulkUpdate = useCallback(
    async (
      updates: Array<{ category: NotificationCategory; channelValues: Partial<Record<NotificationChannel, boolean>> }>,
    ) => {
      isBulkUpdatingRef.current = true;
      setIsBulkUpdating(true);
      try {
        const results = await Promise.allSettled(
          updates.map(({ category, channelValues }) =>
            mutateAsync({ requestBody: { category, channels: channelValues } }),
          ),
        );
        const hasError = results.some((r) => r.status === 'rejected');
        if (hasError) {
          showError({ title: t('errors.updateFailed') });
        } else {
          showSuccess({ title: t('messages.updated') });
        }
      } finally {
        isBulkUpdatingRef.current = false;
        setIsBulkUpdating(false);
      }
    },
    [mutateAsync, showSuccess, showError, t],
  );

  const toggleGroupChannel = useCallback(
    (groupCategories: NotificationCategory[], channel: NotificationChannel, value: boolean) => {
      void runBulkUpdate(groupCategories.map((category) => ({ category, channelValues: { [channel]: value } })));
    },
    [runBulkUpdate],
  );

  const toggleAll = useCallback(
    (value: boolean) => {
      void runBulkUpdate(
        categoryGroups
          .flatMap((g) => g.categories)
          .map((category) => ({
            category,
            channelValues: { email: value, push: value, toast: value },
          })),
      );
    },
    [categoryGroups, runBulkUpdate],
  );

  const isCategoryAllEnabled = useCallback(
    (category: NotificationCategory) =>
      channels.every((ch) => Boolean(getCategoryPreference(preferences?.categories, category)?.channels[ch])),
    [preferences],
  );

  const isGroupChannelAllEnabled = useCallback(
    (groupCategories: NotificationCategory[], channel: NotificationChannel) =>
      groupCategories.every((cat) => Boolean(getCategoryPreference(preferences?.categories, cat)?.channels[channel])),
    [preferences],
  );

  const isAllEnabled = useMemo(
    () => categoryGroups.flatMap((g) => g.categories).every((cat) => isCategoryAllEnabled(cat)),
    [categoryGroups, isCategoryAllEnabled],
  );

  const disabled = isLoading || isBulkUpdating;

  const renderChannelSwitch = (category: NotificationCategory, channel: NotificationChannel) => {
    const preference = getCategoryPreference(preferences?.categories, category);
    const selected = Boolean(preference?.channels[channel]);

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
  return {
    t,
    push,
    showSuccess,
    showError,
    categoryGroups,
    toggleCategory,
    toggleGroupChannel,
    toggleAll,
    isCategoryAllEnabled,
    isGroupChannelAllEnabled,
    isAllEnabled,
    disabled,
    renderChannelSwitch,
  } as const;
}
