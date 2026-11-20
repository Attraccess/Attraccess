import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata } from '../api/client';
import { useConfigurationActions, useConfigurationRevisionsQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';
import { ConfigurationRevisionHistory } from './ConfigurationRevisionHistory';
import { readMetadata } from './model';

export function ConfigurationRevisions({
  controllerId,
  metadata,
  disabled,
  onRollback,
  generation,
  onBusyChange,
}: {
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
  const [rollbackForce, setRollbackForce] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const busy =
    reconciling || actions.preview.isPending || actions.acknowledgeRejection.isPending || actions.rollback.isPending;
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    actions.preview.reset();
    setRollbackForce(false);
    setError(null);
  }, [generation]);
  const preview = actions.preview.data;
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
    <section aria-label={t('revisions.history')} className="wg:flex wg:flex-col wg:gap-4">
      <ConfigurationRevisionHistory
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
