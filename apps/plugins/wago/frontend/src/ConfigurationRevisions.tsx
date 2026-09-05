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
  if (!impacts.length) return null;
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Potential flow impacts</Alert.Title>
        <Alert.Description>
          Publishing can change or break these channel references. Check the listed resource flows before forcing
          publication.
        </Alert.Description>
        <ul>
          {impacts.map((impact) => (
            <li key={impact.channelId}>
              {names[impact.channelId] ?? impact.channelId}: {impact.message}
              {impact.references.length ? (
                impact.references.map((reference) => (
                  <p key={reference.nodeId}>
                    Resource {reference.resourceId}, node {reference.nodeId} ({reference.nodeType})
                  </p>
                ))
              ) : (
                <p>No saved WAGO flow nodes reference this channel.</p>
              )}
            </li>
          ))}
        </ul>
        <Checkbox isSelected={acknowledged} onChange={onChange}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            <Label>I checked the affected channel references and accept these changes</Label>
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
  const preview = useConfigurationRevisionPreviewQuery(controllerId, revision, !!value);
  if (!value) return null;
  if (preview.isPending) return <p>Loading rejected field details…</p>;
  if (preview.isError) return <p>Could not load rejected field details: {preview.error.message}</p>;
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
    return <p>Controller rejection details could not be read.</p>;
  }
}

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
  const [offset, setOffset] = useState(0);
  const history = useConfigurationRevisionsQuery(controllerId, offset);
  const actions = useConfigurationActions(controllerId);
  const [force, setForce] = useState(false);
  const [rollbackForce, setRollbackForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const busy =
    reconciling ||
    actions.review.isPending ||
    actions.publish.isPending ||
    actions.preview.isPending ||
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
  const reviewedHash = review?.draft.reviewedHash;
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
      setError(error instanceof Error ? error.message : 'Configuration operation failed.');
    }
  }
  return (
    <section aria-label="Review and publish" className="wg:flex wg:flex-col wg:gap-3">
      <h2 className="wg:font-medium">Review and publish</h2>
      <p>Save local edits first. Publishing sends a new revision to the controller.</p>
      {offset === 0 && !history.isError && history.data?.revisions[0]?.state === 'applied' && (
        <p>
          <Link href="/resources">Choose a resource for your first flow</Link>. Open its Flows tab, add a WAGO command,
          then select this controller and a named output channel.
        </p>
      )}
      <Button
        variant="secondary"
        isDisabled={disabled || busy}
        onPress={() =>
          void run(async () => {
            setForce(false);
            await actions.review.mutateAsync();
          })
        }
      >
        Review saved draft
      </Button>
      {review && (
        <>
          <ConfigurationChanges
            changes={review.diff}
            before={review.previous ? JSON.parse(review.previous.snapshot) : null}
            after={JSON.parse(review.draft.snapshot)}
            names={reviewNames}
          />
          <ConfigurationMetadataChanges changes={review.metadataDiff ?? []} names={reviewNames} />
          <ImpactWarning impacts={review.impacts} names={reviewNames} acknowledged={force} onChange={setForce} />
          <Button
            isDisabled={disabled || busy || !reviewedHash || (!!review.impacts.length && !force)}
            isPending={actions.publish.isPending}
            onPress={() =>
              void run(async () => {
                if (!reviewedHash) return;
                await actions.publish.mutateAsync({ force, reviewedHash });
                actions.review.reset();
                setOffset(0);
              })
            }
          >
            Publish reviewed draft
          </Button>
        </>
      )}
      {actions.publish.data && (
        <p role="status">
          Publication submitted for revision {actions.publish.data.revision}. Current controller report is shown in
          revision history.
        </p>
      )}
      <p role="status">
        Hardware readiness: unknown. An applied revision confirms configuration acceptance, not physical I/O readiness.
      </p>
      <h3 className="wg:font-medium">Revision history and deployment progress</h3>
      {history.isPending && <p>Loading history…</p>}
      {history.isError && <p role="alert">Could not load history: {history.error.message}</p>}
      {!history.isPending && history.data?.revisions.length === 0 && <p>No published revisions.</p>}
      {history.data?.revisions.map((revision) => (
        <section key={revision.revision} aria-label={`Revision ${revision.revision}`}>
          <p className="wg:font-medium">
            Revision {revision.revision} ·{' '}
            {revision.state === 'pending'
              ? 'Pending delivery'
              : revision.state === 'published'
                ? 'Published — awaiting controller report'
                : revision.state === 'applied'
                  ? 'Applied by controller'
                  : 'Rejected by controller'}
          </p>
          <p>
            Published: {revision.publishedAt} · Reported: {revision.reportedAt ?? 'Not yet reported'}
          </p>
          <RejectionErrors
            value={revision.rejectionErrors}
            controllerId={controllerId}
            revision={revision.revision}
            names={metadata.names}
          />
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
            Preview rollback to revision {revision.revision}
          </Button>
        </section>
      ))}
      <div className="wg:flex wg:gap-2">
        <Button variant="secondary" isDisabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - 20))}>
          Newer revisions
        </Button>
        <Button
          variant="secondary"
          isDisabled={(history.data?.revisions.length ?? 0) < 20}
          onPress={() => setOffset(offset + 20)}
        >
          Older revisions
        </Button>
      </div>
      {preview && (
        <>
          <h3>Restore revision {preview.revision.revision} as a new revision</h3>
          <p>This replaces the saved draft and publishes a new revision. The historical revision is retained.</p>
          <ConfigurationChanges
            changes={preview.diff}
            before={preview.current ? JSON.parse(preview.current.snapshot) : null}
            after={JSON.parse(preview.revision.snapshot)}
            names={rollbackNames}
          />
          <ConfigurationMetadataChanges changes={preview.metadataDiff ?? []} names={rollbackNames} />
          <ImpactWarning
            impacts={preview.impacts}
            names={rollbackNames}
            acknowledged={rollbackForce}
            onChange={setRollbackForce}
          />
          <Button
            variant="danger"
            isDisabled={disabled || busy || (!!preview.impacts.length && !rollbackForce)}
            onPress={() =>
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
          >
            Publish rollback as new revision
          </Button>
          <Button variant="secondary" onPress={() => actions.preview.reset()}>
            Cancel rollback
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
