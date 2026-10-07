import { Button } from '../../../components/button';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { channels } from './index.channels';
import { useNotificationPreferencesFormState } from './useNotificationPreferencesFormState';

export function NotificationPreferencesForm() {
  const {
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
        {categoryGroups.map((group) => {
          return (
            <section key={group.id} data-testid={`notification-group-${group.id}`} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-default-700">{t(`groups.${group.id}.label`)}</h3>
                <p className="text-xs text-default-500">{t(`groups.${group.id}.description`)}</p>
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
                      isSelected={isGroupChannelAllEnabled(group.categories, channel)}
                      isDisabled={disabled}
                      onChange={(value) => toggleGroupChannel(group.categories, channel, value)}
                      data-testid={`notifications-toggle-channel-${group.id}-${channel}`}
                      data-cy={`notifications-toggle-channel-${group.id}-${channel}`}
                    />
                  </div>
                ))}
                <span className="text-center">{t('columns.all')}</span>
              </div>

              <div className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-default-200 lg:rounded-lg lg:border lg:border-default-200">
                {group.categories.map((category) => {
                  return (
                    <div
                      key={category}
                      className="rounded-lg border border-default-200 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))_minmax(4rem,6rem)] lg:gap-3 lg:rounded-none lg:border-0"
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
                        <div className="flex min-h-11 items-center justify-between gap-4 py-2 lg:min-h-0 lg:justify-center lg:py-0">
                          <span className="text-sm text-default-700 lg:hidden">{t('columns.all')}</span>
                          <LabeledSwitch
                            aria-label={`${t(`categories.${category}.label`)} ${t('columns.all')}`}
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
