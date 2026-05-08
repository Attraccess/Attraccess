import { Card, CardContent, CardHeader, Chip } from '@heroui/react';
import { ActivityIcon, CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { MetricsSettingsForm } from '../../forms/MetricsSettingsForm';
import { useSettingsServiceGetMetricsSettings } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export function MetricsSettingsCard() {
  const { t } = useTranslations({ en, de });
  const { data: metricsSettings } = useSettingsServiceGetMetricsSettings();

  const statusChip = metricsSettings ? (
    <Chip color={metricsSettings.apiKeyConfigured ? 'success' : 'warning'} variant="flat">
      <div className="flex items-center gap-2">
        {metricsSettings.apiKeyConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
        {metricsSettings.apiKeyConfigured
          ? t('apiKeyStatus.configured')
          : t('apiKeyStatus.missing')}
      </div>
    </Chip>
  ) : null;

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<ActivityIcon size={18} />}
          noMargin
          actions={statusChip}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MetricsSettingsForm />
      </CardContent>
    </Card>
  );
}
