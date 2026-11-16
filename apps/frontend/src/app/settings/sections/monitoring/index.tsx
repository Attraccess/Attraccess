import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSettingsServiceGetMetricsSettings } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { MonitoringApiKeyRow } from './MonitoringApiKeyRow';
import { MonitoringEndpointAside } from './MonitoringEndpointAside';
import { MonitoringSlowQueryThreshold } from './MonitoringSlowQueryThreshold';
import { MonitoringToggleRows } from './MonitoringToggleRows';
import en from './en.json';
import de from './de.json';

export function MonitoringSection() {
  const { t } = useTranslations({ en, de });
  // Same query/mutation contract as the old MetricsSettingsForm — only the presentation changed.
  const { isLoading } = useSettingsServiceGetMetricsSettings();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('sectionDescription')} aside={<MonitoringEndpointAside />}>
      <MonitoringSlowQueryThreshold>
        <MonitoringApiKeyRow />
        <MonitoringToggleRows />
      </MonitoringSlowQueryThreshold>
    </SettingsSection>
  );
}

export default MonitoringSection;
