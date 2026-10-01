import { Alert, Button, Checkbox, Label, Link } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata, ConfigurationImpact, ConfigurationValidationError } from './api';
import {
  useConfigurationActions,
  useConfigurationRevisionsQuery,
  useConfigurationRevisionPreviewQuery,
} from './queries';
import { ConfigurationChanges, ConfigurationErrors, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { readMetadata } from './configuration-model';
import { useWagoTranslations } from './i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';

function ImpactWarning({
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
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            <Label>{t('revisions.accept')}</Label>
          </Checkbox.Content>
        </Checkbox>
      </Alert.Content>
    </Alert>
  );
}

function RejectionErrors({
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
  const { t, language, tMessage } = useWagoTranslations();
  const [offset, setOffset] = useState(0);
  const history = useConfigurationRevisionsQuery(controllerId, offset);
  const actions = useConfigurationActions(controllerId);
  const [force, setForce] = useState(false);
  const [rollbackForce, setRollbackForce] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const busy =
    reconciling ||
    actions.review.isPending ||
    actions.publish.isPending ||
    actions.preview.isPending ||
    actions.acknowledgeRejection.isPending ||
    actions.rollback.isPending;
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    actions.review.reset();
    actions.preview.reset();
    setForce(false);
    setRollbackForce(false);
    setError(null);
  }, [generation]);
  const review = actions.review.data;
  const preview = actions.preview.data;
  const reviewNames = {
    ...readMetadata(review?.previous?.presetProvenance ?? null).names,
    ...readMetadata(review?.draft.presetProvenance ?? null).names,
  };
  const rollbackNames = { ...metadata.names, ...readMetadata(preview?.revision.presetProvenance ?? null).names };
  async function run(operation: () => Promise<unknown>) {
    setError(null);
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : { key: 'revisions.error' });
    }
  }
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
                <p>
                  {t('revisions.acknowledged', { user: revision.rejectionAcknowledgedBy ?? t('revisions.unknown') })}
                </p>
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
      {error && <p role="alert">{tMessage(error)}</p>}
    </section>
  );
}

function ReviewedDraft({
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

function RollbackReview({
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
