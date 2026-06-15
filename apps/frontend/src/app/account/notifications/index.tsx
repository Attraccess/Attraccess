// Per-user notification preferences control for the account page
// FEATURE: Messaging notification preferences
import { NotificationCategory } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { NotificationChannelSwitch } from './channelSwitch';

export type NotificationChannel = 'email' | 'push' | 'toast';

const categoryGroups: Array<{ id: string; categories: NotificationCategory[] }> = [
  {
    id: 'general',
    categories: [
      NotificationCategory.MESSAGES,
      NotificationCategory.RESOURCE_TAKEOVER,
      NotificationCategory.RESOURCE_SESSION_ENDED,
      NotificationCategory.PROJECT_INVITATIONS,
    ],
  },
  {
    id: 'resourceManagers',
    categories: [
      NotificationCategory.MAINTENANCE_REQUESTS,
      NotificationCategory.RESOURCE_USAGE_NOTES,
      NotificationCategory.RESOURCE_HEALTH,
      NotificationCategory.SUPERVISION_REQUESTS,
    ],
  },
  {
    id: 'admins',
    categories: [NotificationCategory.ACCESS_CHANGES],
  },
];

const channels: NotificationChannel[] = ['email', 'push', 'toast'];

export function NotificationPreferencesForm() {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="notification-preferences-desktop"
        className="hidden grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))] gap-3 text-xs font-medium text-default-500 lg:grid"
      >
        <span>{t('columns.category')}</span>
        <span className="text-center">{t('columns.email')}</span>
        <span className="text-center">{t('columns.push')}</span>
        <span className="text-center">{t('columns.toast')}</span>
      </div>

      <div data-testid="notification-preferences-mobile" className="flex flex-col gap-4">
        {categoryGroups.map((group) => {
          return (
            <section key={group.id} data-testid={`notification-group-${group.id}`} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-default-700">{t(`groups.${group.id}.label`)}</h3>
                <p className="text-xs text-default-500">{t(`groups.${group.id}.description`)}</p>
              </div>

              <div className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-default-200 lg:rounded-lg lg:border lg:border-default-200">
                {group.categories.map((category) => {
                  const categoryLabel = t(`categories.${category}.label`);

                  return (
                    <div
                      key={category}
                      className="rounded-lg border border-default-200 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(4rem,6rem))] lg:gap-3 lg:rounded-none lg:border-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{categoryLabel}</span>
                        <span className="text-xs text-default-500">{t(`categories.${category}.description`)}</span>
                      </div>

                      <div className="mt-3 flex flex-col divide-y divide-default-200 lg:col-span-3 lg:mt-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:divide-y-0">
                        {channels.map((channel) => (
                          <NotificationChannelSwitch
                            key={channel}
                            category={category}
                            categoryLabel={categoryLabel}
                            channel={channel}
                          />
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
