import { Button, EmptyState, TableDataLoadingIndicator, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ConfigurationEditorMetadata, ConfigurationRevisionPage, RevisionPreview } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { RejectionErrors } from './RejectionErrors';
import { RollbackReview } from './RollbackReview';

interface ConfigurationRevisionHistoryProps {
  history: UseQueryResult<ConfigurationRevisionPage>;
  controllerId: number;
  metadata: ConfigurationEditorMetadata;
  disabled: boolean;
  busy: boolean;
  offset: number;
  onOffsetChange: (offset: number) => void;
  preview: RevisionPreview | undefined;
  rollbackNames: Record<string, string>;
  rollbackForce: boolean;
  onRollbackForceChange: (force: boolean) => void;
  onAcknowledge: (revision: number, contentHash: string, reportedAt: string) => void;
  onPreviewRollback: (revision: number) => void;
  onCancelPreview: () => void;
  onPublishRollback: () => void;
}

/** Revision list with rejection acknowledgement and the rollback preview/publish panel. */
export function ConfigurationRevisionHistory({
  history,
  controllerId,
  metadata,
  disabled,
  busy,
  offset,
  onOffsetChange,
  preview,
  rollbackNames,
  rollbackForce,
  onRollbackForceChange,
  onAcknowledge,
  onPreviewRollback,
  onCancelPreview,
  onPublishRollback,
}: ConfigurationRevisionHistoryProps) {
  const { t } = useWagoTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  return (
    <div className="wg:flex wg:flex-col wg:gap-4">
      <h2 className="wg:text-xl wg:font-semibold">{t('revisions.historyTitle')}</h2>
      <p className="wg:text-sm wg:text-muted">{t('revisions.historyDescription')}</p>
      {history.isPending && <TableDataLoadingIndicator label={t('revisions.loading')} />}
      {history.isError && <p role="alert">{t('revisions.loadError', { error: history.error.message })}</p>}
      {!history.isPending && history.data?.revisions.length === 0 && <EmptyState message={t('revisions.empty')} />}
      {history.data?.revisions.map((revision) => {
        const reportedAt = revision.reportedAt;
        return (
          <section
            key={revision.revision}
            aria-label={t('revisions.revision', { revision: revision.revision })}
            className="wg:flex wg:flex-col wg:gap-3 wg:rounded-xl wg:border wg:border-border wg:p-4"
          >
            <p className="wg:font-medium">
              {t('revisions.revision', { revision: revision.revision })} · {t(`revisions.state.${revision.state}`)}
            </p>
            <p>
              {t('revisions.dates', {
                published: formatDateTime(revision.publishedAt),
                reported: revision.reportedAt ? formatDateTime(revision.reportedAt) : t('revisions.notReported'),
              })}
            </p>
            <RejectionErrors
              value={revision.rejectionErrors}
              controllerId={controllerId}
              revision={revision.revision}
              names={metadata.names}
            />
            {revision.state === 'rejected' && !revision.rejectionAcknowledgedAt && reportedAt && (
              <Button
                variant="secondary"
                isDisabled={disabled || busy}
                onPress={() => onAcknowledge(revision.revision, revision.contentHash, reportedAt)}
              >
                {t('revisions.acknowledge', { revision: revision.revision })}
              </Button>
            )}
            {revision.rejectionAcknowledgedAt && (
              <p>{t('revisions.acknowledged', { user: revision.rejectionAcknowledgedBy ?? t('revisions.unknown') })}</p>
            )}
            <Button
              variant="secondary"
              isDisabled={disabled || busy}
              onPress={() => onPreviewRollback(revision.revision)}
            >
              {t('revisions.previewRollback', { revision: revision.revision })}
            </Button>
          </section>
        );
      })}
      <div className="wg:flex wg:gap-2">
        <Button
          variant="secondary"
          isDisabled={busy || offset === 0}
          onPress={() => onOffsetChange(Math.max(0, offset - 20))}
        >
          {t('revisions.newer')}
        </Button>
        <Button
          variant="secondary"
          isDisabled={busy || (history.data?.revisions.length ?? 0) < 20}
          onPress={() => onOffsetChange(offset + 20)}
        >
          {t('revisions.older')}
        </Button>
      </div>
      {preview && (
        <RollbackReview
          preview={preview}
          names={rollbackNames}
          force={rollbackForce}
          onForceChange={onRollbackForceChange}
          disabled={disabled || busy}
          busy={busy}
          onCancel={onCancelPreview}
          onPublish={onPublishRollback}
        />
      )}
    </div>
  );
}
