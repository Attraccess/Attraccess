import { Card, Chip } from '@heroui/react';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { changes, displayValue } from './audit-log-model';
import type { Translate } from './index.translate';
import { actor } from './index.helpers';
import { target } from './index.helpers';
import { auditLabel } from './index.helpers';

export function EntryDetails({ entry, t }: { entry: AuditEntryDto; t: Translate }) {
  const diff = changes(entry);
  const metadata = Object.entries(entry.details).filter(([key]) => !['before', 'after'].includes(key));
  return (
    <div className="space-y-6">
      <Chip
        color={entry.outcome === 'failed' ? 'danger' : entry.outcome === 'succeeded' ? 'success' : 'default'}
        size="sm"
      >
        {t(`outcomes.${entry.outcome}`)}
      </Chip>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
        <dt className="text-muted">{t('eventType')}</dt>
        <dd className="break-all">{entry.action}</dd>
        <dt className="text-muted">{t('time')}</dt>
        <dd>{new Date(entry.at).toLocaleString()}</dd>
        <dt className="text-muted">{t('actor')}</dt>
        <dd className="break-words">
          {actor(entry, t)}
          {entry.actorId !== null && <p className="text-xs text-muted">#{entry.actorId}</p>}
          {entry.actorUsernameSource && <p className="text-xs text-muted">{t(`${entry.actorUsernameSource}Name`)}</p>}
        </dd>
        <dt className="text-muted">{t('target')}</dt>
        <dd className="break-words">
          {target(entry, t)}
          <p className="text-xs text-muted">
            {entry.subjectType}
            {entry.subjectId === null ? '' : ` #${entry.subjectId}`}
          </p>
          {entry.subjectLabelSource && <p className="text-xs text-muted">{t(`${entry.subjectLabelSource}Name`)}</p>}
        </dd>
        <dt className="text-muted">{t('source')}</dt>
        <dd>{entry.authenticationMethod ?? entry.pluginId ?? t('notRecorded')}</dd>
        {typeof entry.apiTokenId === 'number' && (
          <>
            <dt className="text-muted">{t('apiTokenId')}</dt>
            <dd>#{entry.apiTokenId}</dd>
          </>
        )}
        {entry.pluginId && (
          <>
            <dt className="text-muted">{t('pluginId')}</dt>
            <dd className="break-all">{entry.pluginId}</dd>
          </>
        )}
        {entry.ipAddress && (
          <>
            <dt className="text-muted">{t('ipAddress')}</dt>
            <dd className="break-all">{entry.ipAddress}</dd>
          </>
        )}
        {entry.userAgent && (
          <>
            <dt className="text-muted">{t('userAgent')}</dt>
            <dd className="break-all">{entry.userAgent}</dd>
          </>
        )}
      </dl>
      {diff.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">{t('whatChanged')}</h3>
          {diff.map((change) => (
            <Card key={change.field} variant="secondary">
              <Card.Header>
                <Card.Title className="text-sm">{auditLabel('fields', change.field, t)}</Card.Title>
              </Card.Header>
              <Card.Content className="grid grid-cols-2 gap-4 text-sm">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted">{t('before')}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">
                    {change.before === undefined ? t('notRecorded') : displayValue(change.before)}
                  </pre>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted">{t('after')}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">
                    {change.after === undefined ? t('notRecorded') : displayValue(change.after)}
                  </pre>
                </div>
              </Card.Content>
            </Card>
          ))}
        </section>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">{t('recordedDetails')}</h3>
        {metadata.length ? (
          <dl className="space-y-3">
            {metadata.map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs text-muted">{auditLabel('fields', key, t)}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">{t('noDetails')}</p>
        )}
      </section>
      <div className="space-y-2 border-t border-separator pt-4 text-xs text-muted">
        <p>{t('operationId')}</p>
        <p className="break-all font-mono">{entry.operationId}</p>
        <p>{t('immutable')}</p>
      </div>
    </div>
  );
}
