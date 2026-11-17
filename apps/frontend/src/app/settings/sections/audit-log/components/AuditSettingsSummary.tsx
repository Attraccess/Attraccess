import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSettingsServiceSettingsControllerGetAuditSettings } from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import en from '../en.json';
import de from '../de.json';

export function AuditSettingsSummary() {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const { data: settings } = useSettingsServiceSettingsControllerGetAuditSettings(undefined, {
    enabled: hasPermission('system.settings.manage'),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <ShieldCheckIcon size={16} className={settings?.enabled ? 'text-success' : 'text-muted'} />
      <span>{settings ? t(settings.enabled ? 'enabled' : 'disabled') : t('unknownSettings')}</span>
      {settings && (
        <>
          <span aria-hidden>·</span>
          <span>
            {settings.retention_days} {t('retainedDays')}
          </span>
        </>
      )}
    </div>
  );
}
