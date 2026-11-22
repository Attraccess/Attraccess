import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';

export function UnsupportedBrowser() {
  const { t } = useShellyTranslations();
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  return (
    <div className="sh:flex sh:flex-col sh:gap-3" data-cy="shelly-ble-unsupported">
      <StatusAlert status="warning" title={t('ble.unsupported.title')}>
        {t(insecure ? 'ble.unsupported.insecure' : 'ble.unsupported.noApi')}
      </StatusAlert>
      <p className="sh:text-sm sh:text-muted">{t('ble.unsupported.alternatives')}</p>
    </div>
  );
}
