import { DownloadCloudIcon } from 'lucide-react';
import { useMatterTranslations } from '../i18n';
import { useMatterPermissions } from '../permissions';
import { FamilyNotice } from './FamilyNotice';
import { NotAvailableYet } from './NotAvailableYet';
import { SoftwareList } from '../devices/SoftwareList';

/**
 * Software Updates: the current software of every device from the inventory, and an empty state for update discovery
 * and approval, which come with OTA support (ATT-1015, which fills the second part). Visible with
 * `matter.devices.read`; approving and applying will need `matter.devices.manage`.
 */
export function UpdatesTab() {
  const { t } = useMatterTranslations();
  const { canRead } = useMatterPermissions();
  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-updates-tab">
      <NotAvailableYet
        title={t('updates.emptyTitle')}
        icon={<DownloadCloudIcon className="mt:h-8 mt:w-8" />}
        dataCy="matter-updates-empty"
      >
        <FamilyNotice family="ota" />
        <p>{t('updates.emptyText')}</p>
      </NotAvailableYet>
      <SoftwareList enabled={canRead} />
    </div>
  );
}
