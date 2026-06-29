import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ActivityIcon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import { MetricsSettingsCard } from '../settings/cards/MetricsSettingsCard';
import en from './en.json';
import de from './de.json';

export function MonitoringPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ActivityIcon size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <MetricsSettingsCard className="lg:col-span-2" />
      </div>
    </div>
  );
}

export default MonitoringPage;
