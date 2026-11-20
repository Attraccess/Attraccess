import { DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { connectionKey, connectionSeverity } from '../connectionStatus';
import { connectionHealthLevel } from '../healthLevel';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { HealthCard } from './HealthCard';

const SECONDS = { showSeconds: true } as const;

/**
 * Sidecar connection: state, since, next retry, last error code and correlation ID. Same severity as the banner and the
 * status card (see connectionStatus.ts).
 */
export function ConnectionHealthCard() {
  const { t } = useMatterTranslations();
  const { status, statusError } = useMatterConnection();
  const fix = { tab: 'infrastructure', label: t('health.fix.infrastructure') } as const;
  if (!status)
    return (
      <HealthCard
        title={t('health.connection.title')}
        level={statusError ? 'danger' : 'unknown'}
        levelLabel={t(statusError ? 'health.levels.danger' : 'health.levels.unknown')}
        fix={fix}
        loading={!statusError}
        dataCy="matter-health-connection"
      >
        {statusError && (
          <StatusAlert status="danger" title={t('status.loadError')} data-cy="matter-health-connection-error">
            {statusError}
          </StatusAlert>
        )}
      </HealthCard>
    );
  const level = connectionHealthLevel(connectionSeverity(status));
  const key = connectionKey(status);
  return (
    <HealthCard
      title={t('health.connection.title')}
      level={level}
      levelLabel={t(`banner.title.${key}`)}
      fix={fix}
      dataCy="matter-health-connection"
    >
      <p>
        {t('status.since')}: <DateTimeDisplay date={status.since} options={SECONDS} />
      </p>
      {status.nextRetryAt && (
        <p data-cy="matter-health-next-retry">
          {t('status.nextRetry')}: <DateTimeDisplay date={status.nextRetryAt} options={SECONDS} />
        </p>
      )}
      {status.lastError && (
        <p className="mt:break-words" data-cy="matter-health-last-error">
          {t('health.connection.lastError')}: <code>{status.lastError.code}</code>
          {status.lastError.correlationId && (
            <>
              {' '}
              · {t('status.correlationId')}: <code>{status.lastError.correlationId}</code>
            </>
          )}
        </p>
      )}
    </HealthCard>
  );
}
