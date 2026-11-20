import { MonitorSmartphoneIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { CompanionDevice } from '@attraccess/react-query-client';
import { CompanionDevicesCard } from './CompanionDevicesCard';
import { CompanionDownloadCard } from './CompanionDownloadCard';
import { CompanionRenameDrawer } from './CompanionRenameDrawer';
import { CompanionSetupCard } from './CompanionSetupCard';
import en from './en.json';
import de from './de.json';

export function CompanionSettingsPage() {
  const { t } = useTranslations({ en, de });
  const [renamingDevice, setRenamingDevice] = useState<CompanionDevice | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MonitorSmartphoneIcon size={20} />} />

      <CompanionDevicesCard onRenameStart={setRenamingDevice} />

      {/* Download + Setup side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CompanionDownloadCard />
        <CompanionSetupCard />
      </div>

      <CompanionRenameDrawer device={renamingDevice} onClose={() => setRenamingDevice(null)} />
    </div>
  );
}

export default CompanionSettingsPage;
