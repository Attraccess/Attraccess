import { Button } from '@attraccess/plugins-frontend-ui';
import { Link } from '@heroui/react';
import { ConfigurationChanges, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { ConfigurationRevisionsRevisionsHistoryTitle } from './ConfigurationRevisionsRevisionsHistoryTitle';
import type { ConfigurationEditorMetadata } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { useConfigurationActions } from '../api/queries';
import { useConfigurationRevisionsState } from './useConfigurationRevisionsState';
import { ImpactWarning } from './ConfigurationRevisionReview';

export function ReviewedDraft({
  review,
  names,
  disabled,
  force,
  onForceChange,
  publishing,
  onPublish,
}: {
  review: NonNullable<ReturnType<typeof useConfigurationActions>['review']['data']>;
  names: Record<string, string>;
  disabled: boolean;
  force: boolean;
  onForceChange: (force: boolean) => void;
  publishing: boolean;
  onPublish: (reviewedHash: string) => void;
}) {
  const { t } = useWagoTranslations();
  const reviewedHash = review.draft.reviewedHash;
  return (
    <>
      <ConfigurationChanges
        changes={review.diff}
        before={review.previous ? JSON.parse(review.previous.snapshot) : null}
        after={JSON.parse(review.draft.snapshot)}
        names={names}
      />
      <ConfigurationMetadataChanges changes={review.metadataDiff ?? []} names={names} />
      <ImpactWarning impacts={review.impacts} names={names} acknowledged={force} onChange={onForceChange} />
      <Button
        isDisabled={disabled || !reviewedHash || (!!review.impacts.length && !force)}
        isPending={publishing}
        onPress={() => {
          if (reviewedHash) onPublish(reviewedHash);
        }}
      >
        {t('revisions.publish')}
      </Button>
    </>
  );
}

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
