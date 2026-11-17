import { PageHeader, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { CableIcon } from 'lucide-react';
import { FabricBackupSection } from './fabric-backup/FabricBackupSection';
import { useMatterTranslations } from './i18n';
import { useMatterPermissions } from './permissions';
import { SettingsForm } from './SettingsForm';
import { StatusCard } from './StatusCard';
import { useMatterPage } from './useMatterPage';

/**
 * The route opens with any Matter or Thread read key (see plugin.tsx). Status views need `matter.devices.read`; the
 * settings form and the fabric, recovery, backup and restore actions need `matter.devices.manage` (together with
 * `matter.devices.read`) and are hidden without it. Until the host has pushed the auth state, the page only loads.
 */
export function MatterPage() {
  const { t } = useMatterTranslations();
  const permissions = useMatterPermissions();
  const { settings, settingsError, status, statusError, loading, save, remove } = useMatterPage(permissions);

  return (
    <div
      className="mt:mx-auto mt:flex mt:w-full mt:max-w-5xl mt:flex-col mt:gap-6 mt:p-4 mt:md:p-6"
      data-cy="matter-page"
    >
      <PageHeader
        noMargin
        icon={<CableIcon className="mt:h-6 mt:w-6 mt:text-accent-soft-foreground" />}
        title={t('page.title')}
        subtitle={t('page.subtitle')}
      />
      {loading && <Spinner />}
      {status?.insecureTransport && (
        <StatusAlert status="warning" title={t('page.insecure')} data-cy="matter-insecure-warning">
          {t(permissions.canManage ? 'page.insecureText' : 'page.insecureTextReadOnly')}
        </StatusAlert>
      )}
      {statusError && !status && (
        <StatusAlert status="danger" title={t('status.loadError')} data-cy="matter-load-error">
          {statusError}
        </StatusAlert>
      )}
      {permissions.known && !permissions.canRead && (
        <StatusAlert status="default" title={t('page.noDeviceAccess')} data-cy="matter-no-device-access">
          {t('page.noDeviceAccessText')}
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
