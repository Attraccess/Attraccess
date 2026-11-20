import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { HealthCard, type HealthLevel } from './HealthCard';

/** Sidecar connection: state, since, next retry, last error code and correlation ID. */
export function ConnectionHealthCard() {
  const { t } = useMatterTranslations();
  const { status } = useMatterConnection();
  if (!status)
    return (
      <HealthCard
        title={t('health.connection.title')}
        level="unknown"
        levelLabel={t('health.levels.unknown')}
        dataCy="matter-health-connection"
      />
    );
  const level: HealthLevel = status.state === 'connected' ? 'ok' : status.state === 'connecting' ? 'unknown' : 'danger';
  const key = status.state === 'degraded' ? (status.reason ?? 'unavailable') : status.state;
  return (
    <HealthCard
      title={t('health.connection.title')}
      level={level}
      levelLabel={t(`banner.title.${key}`)}
      fix={{ tab: 'infrastructure', label: t('health.fix.infrastructure') }}
      dataCy="matter-health-connection"
    >
      <p>
        {t('status.since')}: <DateTimeDisplay date={status.since} />
      </p>
      {status.nextRetryAt && (
        <p data-cy="matter-health-next-retry">
          {t('status.nextRetry')}: <DateTimeDisplay date={status.nextRetryAt} />
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
