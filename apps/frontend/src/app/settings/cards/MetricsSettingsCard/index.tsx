import { Chip, cn } from '@heroui/react';
import { ActivityIcon, CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MetricsSettingsForm } from '../../forms/MetricsSettingsForm';
import { useSettingsServiceGetMetricsSettings } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export type MetricsSettingsCardProps = {
  className?: string;
};

export function MetricsSettingsCard({ className }: MetricsSettingsCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const { data: metricsSettings } = useSettingsServiceGetMetricsSettings();

  const statusChip = metricsSettings ? (
    <Chip color={metricsSettings.apiKeyConfigured ? 'success' : 'warning'} variant="soft">
      <div className="flex items-center gap-2">
        {metricsSettings.apiKeyConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
        {metricsSettings.apiKeyConfigured
          ? t('apiKeyStatus.configured')
          : t('apiKeyStatus.missing')}
      </div>
    </Chip>
  ) : null;

  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="metrics-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-default-700">
          <ActivityIcon size={18} />
          <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
        </div>
        {statusChip}
      </div>
      <MetricsSettingsForm />
    </section>
  );
}
