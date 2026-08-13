import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Settings2Icon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import en from './en.json';
import de from './de.json';
import { AppSettingsCard } from './cards/AppSettingsCard';
import { VersionInfoCard } from './cards/VersionInfoCard';
import { SystemInfoCard } from './cards/SystemInfoCard';

export function SystemSettingsPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />
      {/* No items-start: grid items stretch so cards in a row share one height. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VersionInfoCard />
        <SystemInfoCard />
        <AppSettingsCard variant="standalone" className="lg:col-span-2" />
      </div>
    </div>
  );
}

export default SystemSettingsPage;
