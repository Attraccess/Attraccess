import { Button, Link } from '@heroui/react';
import type { ConfigurationEditorMetadata } from './api';
import { ReviewedDraft } from './ConfigurationRevisions.helpers';
import { useConfigurationRevisionsState } from './useConfigurationRevisionsState';
import { ConfigurationRevisionsRevisionsHistoryTitle } from './ConfigurationRevisionsRevisionsHistoryTitle';

export function ConfigurationRevisions({
  controllerId,
  metadata,
  disabled,
  onRollback,
  generation,
  onBusyChange,
  view = 'review',
  hasSavedDraft = true,
}: {
  view?: 'review' | 'history';
  hasSavedDraft?: boolean;
  controllerId: number;
  metadata: ConfigurationEditorMetadata;
  disabled: boolean;
  onRollback: (failure?: unknown) => Promise<void>;
  generation: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const {
    t,
    language,
    tMessage,
    offset,
    setOffset,
    history,
    actions,
    force,
    setForce,
    rollbackForce,
    setRollbackForce,
    error,
    setReconciling,
    busy,
    review,
    preview,
    reviewNames,
    rollbackNames,
    run,
  } = useConfigurationRevisionsState({
    controllerId,
    metadata,
    disabled,
    onRollback,
    generation,
    onBusyChange,
    view,
    hasSavedDraft,
  });

  return (
    <section
      aria-label={t(view === 'review' ? 'revisions.review' : 'revisions.history')}
      className="wg:flex wg:flex-col wg:gap-4"
    >
      <div hidden={view !== 'review'}>
        <div className="wg:flex wg:flex-col wg:gap-4">
          <h2 className="wg:font-medium">{t('revisions.review')}</h2>
          <p>{t('revisions.saveFirst')}</p>
          {offset === 0 && !history.isError && history.data?.revisions[0]?.state === 'applied' && (
            <p>
              <Link href="/resources">{t('revisions.chooseResource')}</Link>. {t('revisions.flowHint')}
            </p>
          )}
          <Button
            variant="secondary"
            isDisabled={disabled || busy || !hasSavedDraft}
            onPress={() =>
              void run(async () => {
                setForce(false);
                await actions.review.mutateAsync();
              })
            }
          >
            {t('revisions.reviewDraft')}
          </Button>
          {review && (
            <ReviewedDraft
              review={review}
              names={reviewNames}
              disabled={disabled || busy || !hasSavedDraft}
              force={force}
              onForceChange={setForce}
              publishing={actions.publish.isPending}
              onPublish={(reviewedHash) =>
                void run(async () => {
                  await actions.publish.mutateAsync({ force, reviewedHash });
                  actions.review.reset();
                  setOffset(0);
                })
              }
            />
          )}
          {actions.publish.data && (
            <p role="status">{t('revisions.submitted', { revision: actions.publish.data.revision })}</p>
          )}
        </div>
      </div>
      <ConfigurationRevisionsRevisionsHistoryTitle
        {...{
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
        }}
      />
      {error && <p role="alert">{tMessage(error)}</p>}
    </section>
  );
}
