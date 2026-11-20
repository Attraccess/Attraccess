import { Button, type TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { Link } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata } from '../api/client';
import { useConfigurationActions, useConfigurationRevisionsQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';
import { ConfigurationRevisionHistory } from './ConfigurationRevisionHistory';
import { readMetadata } from './model';
import { ReviewedDraft } from './ReviewedDraft';

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
  const { t, tMessage } = useWagoTranslations();
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
      <ConfigurationRevisionHistory
        hidden={view !== 'history'}
        history={history}
        controllerId={controllerId}
        metadata={metadata}
        disabled={disabled}
        busy={busy}
        offset={offset}
        onOffsetChange={setOffset}
        preview={preview}
        rollbackNames={rollbackNames}
        rollbackForce={rollbackForce}
        onRollbackForceChange={setRollbackForce}
        onAcknowledge={(revision, contentHash, reportedAt) =>
          void run(() => actions.acknowledgeRejection.mutateAsync({ revision, contentHash, reportedAt }))
        }
        onPreviewRollback={(revision) =>
          void run(async () => {
            setRollbackForce(false);
            await actions.preview.mutateAsync(revision);
          })
        }
        onCancelPreview={() => actions.preview.reset()}
        onPublishRollback={() =>
          void run(async () => {
            if (!preview) return;
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
      {error && <p role="alert">{tMessage(error)}</p>}
    </section>
  );
}
