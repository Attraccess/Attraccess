import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Card, Chip } from '@heroui/react';
import type { ConnectionStatus, SupportedCombination } from './api';
import { useMatterTranslations } from './i18n';

const STATE_COLOR = {
  not_configured: 'default',
  connecting: 'accent',
  connected: 'success',
  degraded: 'warning',
} as const;

/** `unavailable` usually heals by itself; the other reasons need the administrator. */
const REASON_COLOR = {
  unavailable: 'warning',
  unauthorized: 'danger',
  incompatible: 'danger',
  misconfigured: 'danger',
} as const;

function Field({ label, children, dataCy }: Readonly<{ label: string; children: React.ReactNode; dataCy?: string }>) {
  return (
    <div className="mt:flex mt:flex-col" data-cy={dataCy}>
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-words">{children}</dd>
    </div>
  );
}

/** What the administrator can do about the current state. */
export function hintKey(status: ConnectionStatus): string {
  if (status.state !== 'degraded') return `hint.${status.state}`;
  if (status.reasonDetail === 'host version unavailable') return 'hint.hostVersion';
  return `hint.${status.reason ?? 'unavailable'}`;
}

/** The lowest Attraccess version of the first supported combination, e.g. `1.11.0` for `^1.11.0`. */
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

export function StatusCard({ status }: Readonly<{ status: ConnectionStatus }>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const error = status.lastError;
  const received = error?.details?.received;
  return (
    <Card data-cy="matter-status-card">
      <Card.Header>
        <Card.Title>{t('status.title')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-4">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <Chip color={STATE_COLOR[status.state]} variant="soft" data-cy="matter-state-chip">
            {t(`status.state.${status.state}`)}
          </Chip>
          {status.reason && (
            <Chip color={REASON_COLOR[status.reason]} variant="soft" data-cy="matter-reason-chip">
              {t(`status.reason.${status.reason}`)}
            </Chip>
          )}
        </div>
        <p data-cy="matter-hint">{t(hintKey(status), { attraccess: minimumAttraccess(status) })}</p>
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
          <Field label={t('status.since')}>{formatDateTime(status.since)}</Field>
          {status.nextRetryAt && (
            <Field label={t('status.nextRetry')} dataCy="matter-next-retry">
              {formatDateTime(status.nextRetryAt)}
            </Field>
          )}
          {status.sidecar && (
            <>
              <Field label={t('status.sidecarVersion')}>{status.sidecar.sidecar}</Field>
              <Field label={t('status.matterJsVersion')}>{status.sidecar.matterJs}</Field>
            </>
          )}
          <Field label={t('status.wireVersion')}>{status.wireVersion}</Field>
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
