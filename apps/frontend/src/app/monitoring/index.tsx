import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ActivityIcon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import { MetricsSettingsForm } from '../settings/forms/MetricsSettingsForm';
import en from './en.json';
import de from './de.json';

export function MonitoringPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ActivityIcon size={20} />} />
      <MetricsSettingsForm />
    </div>
  );
}

export default MonitoringPage;
