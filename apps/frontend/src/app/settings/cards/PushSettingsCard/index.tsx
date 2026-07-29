import { Chip, cn } from '@heroui/react';
import { BellIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePushServicePushGetVapidConfig } from '@attraccess/react-query-client';
import { PushSettingsForm } from '../../forms/PushSettingsForm';
import en from './en.json';
import de from './de.json';

export type PushSettingsCardProps = {
  className?: string;
};

export function PushSettingsCard({ className }: PushSettingsCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const { data: vapidConfig } = usePushServicePushGetVapidConfig();

  const subscriptionChip = vapidConfig ? (
    <Chip color="default" variant="soft">
      {t('subscriptionCount', { count: vapidConfig.subscriptionCount })}
    </Chip>
  ) : null;

  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="push-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-default-700">
          <BellIcon size={18} />
          <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
        </div>
        {subscriptionChip}
      </div>
      <p className="text-sm text-default-500">{t('description')}</p>
      <PushSettingsForm />
    </section>
  );
}
