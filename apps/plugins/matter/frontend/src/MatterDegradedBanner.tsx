import { Button, StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectionKey, connectionSeverity, hintKey } from './connectionStatus';
import { errorMessage } from './errorMessage';
import { useMatterConnection } from './MatterConnectionContext';
import { matterTabPath } from './matterPaths';
import { useMatterTranslations } from './i18n';
import type { MatterPermissions } from './permissions';

/**
 * The global banner: shown on every tab while the sidecar is not connected, with the reason and where to fix it, and
 * the insecure-transport warning. The rest of the page stays usable. Read-only users get no controls.
 */
export function MatterDegradedBanner({
  permissions,
  onInfrastructure,
}: Readonly<{ permissions: MatterPermissions; onInfrastructure: boolean }>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { status, retryNow } = useMatterConnection();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  if (!status) return null;

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryNow();
    } catch (error) {
      setRetryError(errorMessage(error));
    } finally {
      setRetrying(false);
    }
  };

  const key = connectionKey(status);
  const connected = status.state === 'connected';
  const configured = status.state !== 'not_configured';
  return (
    <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-banners">
      {!connected && (
        <StatusAlert
          status={connectionSeverity(status)}
          title={t(`banner.title.${key}`)}
          data-cy="matter-degraded-banner"
        >
          <span className="mt:block">
            {/* "Not configured since" says nothing: a connection that was never set up has no start. */}
            {configured && t(`banner.since.${key}`, { time: formatDateTime(status.since) })}
            {/* On Infrastructure the status card right below says what to do; elsewhere the banner does. */}
            {!onInfrastructure && `${configured ? ' ' : ''}${t(hintKey(status, permissions.canManage))}`}
          </span>
          {status.nextRetryAt && !onInfrastructure && (
            <span className="mt:block mt:text-sm" data-cy="matter-banner-next-retry">
              {t('status.nextRetry')}: {formatDateTime(status.nextRetryAt)}
            </span>
          )}
          {retryError && (
            <span className="mt:block mt:text-sm" data-cy="matter-retry-error">
              {t('banner.retryError')}: {retryError}
            </span>
          )}
          <span className="mt:mt-2 mt:flex mt:flex-wrap mt:gap-2">
            {permissions.canRead && !onInfrastructure && (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => navigate(matterTabPath('infrastructure'))}
                data-cy="matter-banner-infrastructure"
              >
                {t('banner.openInfrastructure')}
              </Button>
            )}
            {permissions.canManage && configured && (
              <Button size="sm" variant="secondary" isPending={retrying} onPress={retry} data-cy="matter-retry-now">
                {t('banner.retryNow')}
              </Button>
            )}
          </span>
        </StatusAlert>
      )}
      {status.insecureTransport && (
        <StatusAlert status="warning" title={t('page.insecure')} data-cy="matter-insecure-warning">
          {t(permissions.canManage ? 'page.insecureText' : 'page.insecureTextReadOnly')}
        </StatusAlert>
      )}
    </div>
  );
}
