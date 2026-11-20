import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Card, Chip } from '@heroui/react';
import type { ConnectionStatus, SupportedCombination } from './api';
import { connectionSeverity, hintKey } from './connectionStatus';
import { Fact } from './Fact';
import { useMatterTranslations } from './i18n';

/** The lowest Attraccess version of the first supported combination, e.g. `2.0.0` for `^2.0.0`. */
function minimumAttraccess(status: ConnectionStatus): string {
  const range = status.supported[0]?.attraccess ?? '';
  return range.match(/\d+\.\d+\.\d+/)?.[0] ?? range;
}

function Combination({ entry }: Readonly<{ entry: SupportedCombination | Record<string, unknown> }>) {
  const { t } = useMatterTranslations();
  const value = (key: string) => String((entry as Record<string, unknown>)[key] ?? '?');
  return (
    <li>
      {t('status.combination', {
        attraccess: value('attraccess'),
        plugin: value('plugin'),
        sidecar: value('sidecar'),
        matterJs: value('matterJs'),
      })}
    </li>
  );
}

export function StatusCard({ status, canManage }: Readonly<{ status: ConnectionStatus; canManage: boolean }>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  // While the sidecar is not connected, its versions are what it reported last (or what this plugin expects): say so.
  const versionLabel = (key: string) =>
    status.state === 'connected' ? t(key) : t('status.lastKnown', { label: t(key) });
  const error = status.lastError;
  const received = error?.details?.received;
  const severity = connectionSeverity(status);
  return (
    <Card data-cy="matter-status-card">
      <Card.Header>
        <Card.Title>{t('status.title')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-4">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <Chip color={severity} variant="soft" data-cy="matter-state-chip">
            {t(`status.state.${status.state}`)}
          </Chip>
          {status.reason && (
            <Chip color={severity} variant="soft" data-cy="matter-reason-chip">
              {t(`status.reason.${status.reason}`)}
            </Chip>
          )}
        </div>
        <p data-cy="matter-hint">{t(hintKey(status, canManage), { attraccess: minimumAttraccess(status) })}</p>
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
          <Fact label={t('status.since')}>{formatDateTime(status.since)}</Fact>
          {status.nextRetryAt && (
            <Fact label={t('status.nextRetry')} dataCy="matter-next-retry">
              {formatDateTime(status.nextRetryAt)}
            </Fact>
          )}
          {status.sidecar && (
            <>
              <Fact label={versionLabel('status.sidecarVersion')} dataCy="matter-sidecar-version">
                {status.sidecar.sidecar}
              </Fact>
              <Fact label={versionLabel('status.matterJsVersion')} dataCy="matter-matterjs-version">
                {status.sidecar.matterJs}
              </Fact>
            </>
          )}
          <Fact label={versionLabel('status.wireVersion')} dataCy="matter-wire-version">
            {status.wireVersion}
          </Fact>
        </dl>
        {error && (
          <StatusAlert status="warning" title={t('status.lastError')} data-cy="matter-last-error">
            {error.message}
            {error.correlationId && (
              <span className="mt:block mt:text-xs">
                {t('status.correlationId')}: {error.correlationId}
              </span>
            )}
          </StatusAlert>
        )}
        {status.reason === 'incompatible' && (
          <div data-cy="matter-compatibility">
            {received && (
              <>
                <p className="mt:font-medium">{t('status.received')}</p>
                <ul className="mt:list-disc mt:pl-5">
                  <Combination entry={received} />
                </ul>
              </>
            )}
            <p className="mt:font-medium">{t('status.supported')}</p>
            <ul className="mt:list-disc mt:pl-5">
              {status.supported.map((entry) => (
                <Combination key={`${entry.plugin}-${entry.sidecar}`} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
