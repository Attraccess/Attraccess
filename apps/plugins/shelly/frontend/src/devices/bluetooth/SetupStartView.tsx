import { Spinner } from '@heroui/react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';

/** Before a device is chosen: what to do, the connect error if any, or the connecting spinner. */
export function SetupStartView({ connecting, error }: { connecting: boolean; error?: string }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:gap-3">
      <p className="sh:text-sm">{t('ble.start.intro')}</p>
      <p className="sh:text-sm sh:text-muted">{t('ble.start.hint')}</p>
      {error && (
        <StatusAlert status="danger" title={t('ble.connect.title')} data-cy="shelly-ble-connect-error">
          {error}
        </StatusAlert>
      )}
      {connecting && (
        <div className="sh:flex sh:items-center sh:gap-3 sh:text-sm sh:text-muted">
          <Spinner color="accent" size="sm" />
          {t('ble.start.connecting')}
        </div>
      )}
    </div>
  );
}
