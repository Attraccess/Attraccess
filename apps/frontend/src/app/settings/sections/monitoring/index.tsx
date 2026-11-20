import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetMetricsSettings } from '@attraccess/react-query-client';
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
  // The one subscription lives here and the rows get the settings as props: rows subscribing after
  // the gate refetched the settings on mount (the shared client has no `staleTime`).
  const { data: metricsSettings, isLoading } = useGetMetricsSettings();
  // Above the gate: a refetch of settings that failed to load goes back to loading, which unmounts
  // the rows. Generate does exactly that (it invalidates), and its key is shown only once.
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number | undefined>(undefined);

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
      <MonitoringSlowQueryThreshold
        savedThreshold={metricsSettings?.slowQueryThresholdSeconds}
        thresholdDraft={thresholdDraft}
        setThresholdDraft={setThresholdDraft}
      >
        <MonitoringApiKeyRow
          apiKeyConfigured={metricsSettings?.apiKeyConfigured}
          generatedKey={generatedKey}
          setGeneratedKey={setGeneratedKey}
        />
        <MonitoringToggleRows toggles={metricsSettings?.toggles} />
      </MonitoringSlowQueryThreshold>
    </SettingsSection>
  );
}

export default MonitoringSection;
