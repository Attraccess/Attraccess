import { Alert, Button, Checkbox, Link } from '@heroui/react';
import { ConfigurationChanges, ConfigurationErrors, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { ConfigurationRevisionsRevisionsHistoryTitle } from './ConfigurationRevisionsRevisionsHistoryTitle';
import type { ConfigurationEditorMetadata, ConfigurationImpact, ConfigurationValidationError } from '../api/client';
import { readMetadata } from './model';
import { useWagoTranslations } from '../i18n';
import { useConfigurationActions, useConfigurationRevisionPreviewQuery } from '../api/queries';
import { useConfigurationRevisionsState } from './useConfigurationRevisionsState';

export function ImpactWarning({
  impacts,
  names,
  acknowledged,
  onChange,
}: {
  impacts: ConfigurationImpact[];
  names: Record<string, string>;
  acknowledged: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  if (!impacts.length) return null;
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('revisions.impacts')}</Alert.Title>
        <Alert.Description>{t('revisions.impactDescription')}</Alert.Description>
        <ul>
          {impacts.map((impact) => (
            <li key={impact.channelId}>
              {names[impact.channelId] ?? impact.channelId}: {tBackendMessage(impact.message)}
              {impact.references.length ? (
                impact.references.map((reference) => (
                  <p key={reference.nodeId}>
                    {t('revisions.reference', {
                      resource: reference.resourceId,
                      node: reference.nodeId,
                      type: reference.nodeType,
                    })}
                  </p>
                ))
              ) : (
                <p>{t('revisions.noReferences')}</p>
              )}
            </li>
          ))}
        </ul>
        <Checkbox isSelected={acknowledged} onChange={onChange}>
          <Checkbox.Content className="wg:items-start">
            <Checkbox.Control className="wg:mt-0.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('revisions.accept')}
          </Checkbox.Content>
        </Checkbox>
      </Alert.Content>
    </Alert>
  );
}

export function RejectionErrors({
  value,
  controllerId,
  revision,
  names,
}: {
  value: string | null;
  controllerId: number;
  revision: number;
  names: Record<string, string>;
}) {
  const { t } = useWagoTranslations();
  const preview = useConfigurationRevisionPreviewQuery(controllerId, revision, !!value);
  if (!value) return null;
  if (preview.isPending) return <p>{t('revisions.loadingRejected')}</p>;
  if (preview.isError) return <p>{t('revisions.rejectedError', { error: preview.error.message })}</p>;
  try {
    const errors = JSON.parse(value) as ConfigurationValidationError[];
    if (!Array.isArray(errors)) throw new Error('invalid errors');
    return (
      <ConfigurationErrors
        errors={errors}
        snapshot={JSON.parse(preview.data.revision.snapshot)}
        names={{ ...names, ...readMetadata(preview.data.revision.presetProvenance ?? null).names }}
      />
    );
  } catch {
    return <p>{t('revisions.rejectedUnreadable')}</p>;
  }
}

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

export function RollbackReview({
  preview,
  names,
  force,
  onForceChange,
  disabled,
  busy,
  onPublish,
  onCancel,
}: {
  preview: NonNullable<ReturnType<typeof useConfigurationActions>['preview']['data']>;
  names: Record<string, string>;
  force: boolean;
  onForceChange: (force: boolean) => void;
  disabled: boolean;
  busy: boolean;
  onPublish: () => void;
  onCancel: () => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <>
      <h3>{t('revisions.restore', { revision: preview.revision.revision })}</h3>
      <p>{t('revisions.restoreDescription')}</p>
      <ConfigurationChanges
        changes={preview.diff}
        before={preview.current ? JSON.parse(preview.current.snapshot) : null}
        after={JSON.parse(preview.revision.snapshot)}
        names={names}
      />
      <ConfigurationMetadataChanges changes={preview.metadataDiff ?? []} names={names} />
      <ImpactWarning impacts={preview.impacts} names={names} acknowledged={force} onChange={onForceChange} />
      <Button variant="danger" isDisabled={disabled || (!!preview.impacts.length && !force)} onPress={onPublish}>
        {t('revisions.publishRollback')}
      </Button>
      <Button variant="secondary" isDisabled={busy} onPress={onCancel}>
        {t('revisions.cancelRollback')}
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
