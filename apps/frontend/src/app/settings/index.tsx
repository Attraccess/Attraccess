import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Settings2Icon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import en from './en.json';
import de from './de.json';
import { AppSettingsCard } from './cards/AppSettingsCard';
import { SmtpSettingsCard } from './cards/SmtpSettingsCard';
import { MetricsSettingsCard } from './cards/MetricsSettingsCard';

export function SystemSettingsPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />
      <div className="flex flex-col gap-8">
        <AppSettingsCard variant="standalone" />
        <SmtpSettingsCard variant="standalone" />
        <MetricsSettingsCard />
      </div>
    </div>
  );
}

export default SystemSettingsPage;
