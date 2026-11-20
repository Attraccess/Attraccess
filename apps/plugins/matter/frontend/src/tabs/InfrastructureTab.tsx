import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { FabricBackupSection } from '../fabric-backup/FabricBackupSection';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { useMatterPermissions } from '../permissions';
import { SettingsForm } from '../SettingsForm';
import { StatusCard } from '../StatusCard';

/**
 * Infrastructure: the connection status, the connection settings (manage) and the fabric and backup section, which
 * moved here as one component (ATT-998). Visible with `matter.devices.read`; the settings, fabric, recovery key,
 * backup and restore controls need `matter.devices.manage`. No secret is ever shown: the credential is write-only.
 */
export function InfrastructureTab() {
  const { t } = useMatterTranslations();
  const permissions = useMatterPermissions();
  const { status, statusError, settings, settingsError, loading, save, remove } = useMatterConnection();
  return (
    <div className="mt:flex mt:flex-col mt:gap-6" data-cy="matter-infrastructure-tab">
      {loading && <Spinner />}
      {statusError && !status && (
        <StatusAlert status="danger" title={t('status.loadError')} data-cy="matter-load-error">
          {statusError}
        </StatusAlert>
      )}
      {status && <StatusCard status={status} canManage={permissions.canManage} />}
      {settingsError && !settings && (
        <StatusAlert status="danger" title={t('form.loadError')} data-cy="matter-settings-load-error">
          {settingsError}
        </StatusAlert>
      )}
      {permissions.canRead && <FabricBackupSection canManage={permissions.canManage} />}
      {permissions.canManage && settings && <SettingsForm settings={settings} onSave={save} onRemove={remove} />}
    </div>
  );
}
