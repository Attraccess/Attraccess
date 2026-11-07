import {
  ApiError,
  NotificationCategory,
  UseNotificationsServiceNotificationsGetPreferencesKeyFn,
  useLicenseServiceGetLicenseInformation,
  useNotificationsServiceNotificationsGetPreferences,
  useNotificationsServiceNotificationsUpdatePreferences,
  NotificationCategoryPreferenceDto,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, LabeledSwitch, useTranslations, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export type NotificationChannel = 'email' | 'push' | 'toast';

export const channels: NotificationChannel[] = ['email', 'push', 'toast'];

/** One preference row: a core category or a category a plugin declared (keyed `plugin.<plugin>.<id>`). */
export interface PreferenceRow {
  key: string;
  label: string;
  description?: string;
}

export interface PreferenceGroup {
  id: string;
  label: string;
  description?: string;
  rows: PreferenceRow[];
}

export function getCategoryPreference(
  preferences: NotificationCategoryPreferenceDto[] | undefined,
  category: NotificationCategory,
): NotificationCategoryPreferenceDto | undefined {
  return preferences?.find((preference) => preference.category === category);
}

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
  const language = useTranslationState((state) => state.language);

  const groups: PreferenceGroup[] = useMemo(() => {
    const core = categoryGroups.map((group) => ({
      id: group.id,
      label: t(`groups.${group.id}.label`),
      description: t(`groups.${group.id}.description`),
      rows: group.categories.map((category) => ({
        key: category,
        label: t(`categories.${category}.label`),
        description: t(`categories.${category}.description`),
      })),
    }));
    const byPlugin = new Map<string, PreferenceRow[]>();
    for (const category of preferences?.pluginCategories ?? []) {
      const rows = byPlugin.get(category.pluginName) ?? [];
      rows.push({ key: category.category, label: category.label[language] ?? category.label.en });
      byPlugin.set(category.pluginName, rows);
    }
    return [
      ...core,
      ...[...byPlugin].map(([pluginName, rows]) => ({
        id: `plugin-${pluginName}`,
        label: pluginName,
        description: t('groups.plugin.description'),
        rows,
      })),
    ];
  }, [categoryGroups, preferences, language, t]);

  /** Current channel flags of a core or plugin category. */
  const preferenceOf = useCallback(
    (key: string) =>
      preferences?.categories.find((preference) => preference.category === key) ??
      preferences?.pluginCategories?.find((preference) => preference.category === key),
    [preferences],
  );

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
    (category: string, channel: NotificationChannel, value: boolean) => {
      mutate({ requestBody: { category, channels: { [channel]: value } } });
    },
    [mutate],
  );

  const toggleCategory = useCallback(
    (category: string, value: boolean) => {
      mutate({ requestBody: { category, channels: { email: value, push: value, toast: value } } });
    },
    [mutate],
  );

  const runBulkUpdate = useCallback(
    async (updates: Array<{ category: string; channelValues: Partial<Record<NotificationChannel, boolean>> }>) => {
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
    (groupCategories: string[], channel: NotificationChannel, value: boolean) => {
      void runBulkUpdate(groupCategories.map((category) => ({ category, channelValues: { [channel]: value } })));
    },
    [runBulkUpdate],
  );

  const toggleAll = useCallback(
    (value: boolean) => {
      void runBulkUpdate(
        groups
          .flatMap((g) => g.rows.map((row) => row.key))
          .map((category) => ({
            category,
            channelValues: { email: value, push: value, toast: value },
          })),
      );
    },
    [groups, runBulkUpdate],
  );

  const isCategoryAllEnabled = useCallback(
    (category: string) => channels.every((ch) => Boolean(preferenceOf(category)?.channels[ch])),
    [preferenceOf],
  );

  const isGroupChannelAllEnabled = useCallback(
    (groupCategories: string[], channel: NotificationChannel) =>
      groupCategories.every((cat) => Boolean(preferenceOf(cat)?.channels[channel])),
    [preferenceOf],
  );

  const isAllEnabled = useMemo(
    () => groups.flatMap((g) => g.rows).every((row) => isCategoryAllEnabled(row.key)),
    [groups, isCategoryAllEnabled],
  );

  const disabled = isLoading || isBulkUpdating;

  const renderChannelSwitch = (row: PreferenceRow, channel: NotificationChannel) => {
    const category = row.key;
    const selected = Boolean(preferenceOf(category)?.channels[channel]);

    return (
      <LabeledSwitch
        aria-label={`${row.label} ${t(`columns.${channel}`)}`}
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
    groups,
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

export function NotificationPreferencesForm() {
  const {
    t,
    push,
    showSuccess,
    showError,
    groups,
    toggleCategory,
    toggleGroupChannel,
    toggleAll,
    isCategoryAllEnabled,
    isGroupChannelAllEnabled,
    isAllEnabled,
    disabled,
    renderChannelSwitch,
  } = useNotificationPreferencesFormState();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-default-200 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t('toggleAll.label')}</span>
          <span className="text-xs text-default-500">{t('toggleAll.description')}</span>
        </div>
        <LabeledSwitch
          aria-label={t('toggleAll.label')}
          isSelected={isAllEnabled}
          isDisabled={disabled}
          onChange={toggleAll}
          data-testid="notifications-toggle-all"
          data-cy="notifications-toggle-all"
        />
      </div>

      <div data-testid="notification-preferences-mobile" className="flex flex-row gap-4 flex-wrap">
        {groups.map((group) => {
          return (
            <section key={group.id} data-testid={`notification-group-${group.id}`} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-default-700">{group.label}</h3>
                {group.description && <p className="text-xs text-default-500">{group.description}</p>}
              </div>

              <div
                data-testid={`notification-channel-labels-${group.id}`}
                className="hidden grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))_minmax(4rem,6rem)] gap-3 px-3 text-xs font-medium text-default-500 lg:grid"
              >
                <span aria-hidden="true" />
                {channels.map((channel) => (
                  <div key={channel} className="flex flex-col items-center gap-1">
                    <span className="text-center">{t(`columns.${channel}`)}</span>
                    <LabeledSwitch
                      size="sm"
                      aria-label={`${t('toggleAll.toggleChannel')} ${t(`columns.${channel}`)}`}
                      isSelected={isGroupChannelAllEnabled(
                        group.rows.map((row) => row.key),
                        channel,
                      )}
                      isDisabled={disabled}
                      onChange={(value) =>
                        toggleGroupChannel(
                          group.rows.map((row) => row.key),
                          channel,
                          value,
                        )
                      }
                      data-testid={`notifications-toggle-channel-${group.id}-${channel}`}
                      data-cy={`notifications-toggle-channel-${group.id}-${channel}`}
                    />
                  </div>
                ))}
                <span className="text-center">{t('columns.all')}</span>
              </div>

              <div className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-default-200 lg:rounded-lg lg:border lg:border-default-200">
                {group.rows.map((row) => {
                  const category = row.key;
                  return (
                    <div
                      key={category}
                      className="rounded-lg border border-default-200 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))_minmax(4rem,6rem)] lg:gap-3 lg:rounded-none lg:border-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{row.label}</span>
                        {row.description && <span className="text-xs text-default-500">{row.description}</span>}
                      </div>

                      <div className="mt-3 flex flex-col divide-y divide-default-200 lg:contents lg:divide-y-0">
                        {channels.map((channel) => (
                          <div
                            key={channel}
                            className="flex min-h-11 items-center justify-between gap-4 py-2 lg:min-h-0 lg:justify-center lg:py-0"
                          >
                            <span className="text-sm text-default-700 lg:hidden">{t(`columns.${channel}`)}</span>
                            {renderChannelSwitch(row, channel)}
                          </div>
                        ))}
                        <div className="flex min-h-11 items-center justify-between gap-4 py-2 lg:min-h-0 lg:justify-center lg:py-0">
                          <span className="text-sm text-default-700 lg:hidden">{t('columns.all')}</span>
                          <LabeledSwitch
                            aria-label={`${row.label} ${t('columns.all')}`}
                            isSelected={isCategoryAllEnabled(category)}
                            isDisabled={disabled}
                            onChange={(value) => toggleCategory(category, value)}
                            data-testid={`notifications-${category}-all`}
                            data-cy={`notifications-${category}-all`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-default-500">{t('description.push')}</p>
        {!push.isSupported ? (
          <p className="text-sm text-default-500">{t('messagesPush.unsupported')}</p>
        ) : push.permission === 'denied' ? (
          <p className="text-sm text-default-500">{t('messagesPush.permissionDenied')}</p>
        ) : (
          <Button
            variant="secondary"
            isPending={push.isBusy}
            isDisabled={push.isLoadingKey || !push.publicKey}
            onPress={async () => {
              try {
                if (await push.subscribe()) {
                  showSuccess({ title: t('messagesPush.enabled') });
                  return;
                }
              } catch {
                // Use the same actionable feedback for rejected and failed subscriptions.
              }
              showError({ title: t('messagesPush.errors.subscribeFailed') });
            }}
          >
            {t('messagesPush.enable')}
          </Button>
        )}
      </div>
    </div>
  );
}
