import { Button } from '@heroui/react';
import { RejectionErrors } from './ConfigurationRevisions';
import { RollbackReview } from './ConfigurationRevisions';
import { useConfigurationRevisionsState } from './useConfigurationRevisionsState';
type Props = Pick<
  ReturnType<typeof useConfigurationRevisionsState>,
  | 'view'
  | 't'
  | 'history'
  | 'language'
  | 'controllerId'
  | 'metadata'
  | 'disabled'
  | 'busy'
  | 'run'
  | 'actions'
  | 'setRollbackForce'
  | 'offset'
  | 'setOffset'
  | 'preview'
  | 'rollbackNames'
  | 'rollbackForce'
  | 'setReconciling'
  | 'onRollback'
>;
export function ConfigurationRevisionsRevisionsHistoryTitle({
  view,
  t,
  history,
  language,
  controllerId,
  metadata,
  disabled,
  busy,
  run,
  actions,
  setRollbackForce,
  offset,
  setOffset,
  preview,
  rollbackNames,
  rollbackForce,
  setReconciling,
  onRollback,
}: Props) {
  return (
    <div hidden={view !== 'history'}>
      <div className="wg:flex wg:flex-col wg:gap-4">
        <h2 className="wg:text-xl wg:font-semibold">{t('revisions.historyTitle')}</h2>
        <p className="wg:text-sm wg:text-muted">{t('revisions.historyDescription')}</p>
        {history.isPending && <p>{t('revisions.loading')}</p>}
        {history.isError && <p role="alert">{t('revisions.loadError', { error: history.error.message })}</p>}
        {!history.isPending && history.data?.revisions.length === 0 && <p>{t('revisions.empty')}</p>}
        {history.data?.revisions.map((revision) => (
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
                published: new Date(revision.publishedAt).toLocaleString(language),
                reported: revision.reportedAt
                  ? new Date(revision.reportedAt).toLocaleString(language)
                  : t('revisions.notReported'),
              })}
            </p>
            <RejectionErrors
              value={revision.rejectionErrors}
              controllerId={controllerId}
              revision={revision.revision}
              names={metadata.names}
            />
            {revision.state === 'rejected' && !revision.rejectionAcknowledgedAt && revision.reportedAt && (
              <Button
                variant="secondary"
                isDisabled={disabled || busy}
                onPress={() =>
                  void run(() =>
                    actions.acknowledgeRejection.mutateAsync({
                      revision: revision.revision,
                      contentHash: revision.contentHash,
                      reportedAt: revision.reportedAt!,
                    }),
                  )
                }
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
              onPress={() =>
                void run(async () => {
                  setRollbackForce(false);
                  await actions.preview.mutateAsync(revision.revision);
                })
              }
            >
              {t('revisions.previewRollback', { revision: revision.revision })}
            </Button>
          </section>
        ))}
        <div className="wg:flex wg:gap-2">
          <Button
            variant="secondary"
            isDisabled={busy || offset === 0}
            onPress={() => setOffset(Math.max(0, offset - 20))}
          >
            {t('revisions.newer')}
          </Button>
          <Button
            variant="secondary"
            isDisabled={busy || (history.data?.revisions.length ?? 0) < 20}
            onPress={() => setOffset(offset + 20)}
          >
            {t('revisions.older')}
          </Button>
        </div>
        {preview && (
          <RollbackReview
            preview={preview}
            names={rollbackNames}
            force={rollbackForce}
            onForceChange={setRollbackForce}
            disabled={disabled || busy}
            busy={busy}
            onCancel={() => actions.preview.reset()}
            onPublish={() =>
              void run(async () => {
                setReconciling(true);
                let failure: unknown;
                try {
                  await actions.rollback.mutateAsync({
                    revision: preview.revision.revision,
                    force: rollbackForce,
                    sourceHash: preview.revision.contentHash,
                    currentHash: preview.current?.contentHash ?? null,
                    draftHash: preview.draftHash,
                  });
                } catch (error) {
                  failure = error;
                }
                try {
                  actions.review.reset();
                  actions.preview.reset();
                  setOffset(0);
                  await onRollback(failure);
                } finally {
                  setReconciling(false);
                }
              })
            }
          />
        )}
      </div>
    </div>
  );
}
