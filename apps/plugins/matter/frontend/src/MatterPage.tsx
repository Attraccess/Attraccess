import { PageHeader, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { CableIcon } from 'lucide-react';
import { useMatterTranslations } from './i18n';
import { SettingsForm } from './SettingsForm';
import { StatusCard } from './StatusCard';
import { useMatterPage } from './useMatterPage';

// TODO(ATT-1003): the route is guarded by system.plugins.manage until Matter has its own permission (see plugin.tsx).
export function MatterPage() {
  const { t } = useMatterTranslations();
  const { settings, settingsError, status, statusError, loading, save, remove } = useMatterPage();

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
          {t('page.insecureText')}
        </StatusAlert>
      )}
      {statusError && !status && (
        <StatusAlert status="danger" title={t('status.loadError')} data-cy="matter-load-error">
          {statusError}
        </StatusAlert>
      )}
      {status && <StatusCard status={status} />}
      {settingsError && !settings && (
        <StatusAlert status="danger" title={t('form.loadError')} data-cy="matter-settings-load-error">
          {settingsError}
        </StatusAlert>
      )}
      {settings && <SettingsForm settings={settings} onSave={save} onRemove={remove} />}
    </div>
  );
}
