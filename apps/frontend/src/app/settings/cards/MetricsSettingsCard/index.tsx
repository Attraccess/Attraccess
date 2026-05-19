import { Chip } from '@heroui/react';
import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MetricsSettingsForm } from '../../forms/MetricsSettingsForm';
import { useSettingsServiceGetMetricsSettings } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export function MetricsSettingsCard() {
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
      className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0"
      data-cy="metrics-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('title')}
        </h3>
        {statusChip}
      </div>
      <MetricsSettingsForm />
    </section>
  );
}
