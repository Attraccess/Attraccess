import { Card } from '@heroui/react';
import { emptyConfiguration, readMetadata } from './model';
import { ConfigurationRevisions } from './ConfigurationRevisions';
import { draftIdentity } from './ConfigurationEditor';
import { useConfigurationSessionState } from './useConfigurationSessionState';
type Props = Pick<
  ReturnType<typeof useConfigurationSessionState>,
  | 'section'
  | 'controllerId'
  | 'metadata'
  | 'generation'
  | 'reviewDisabled'
  | 'draft'
  | 'setRevisionBusy'
  | 'setInitialized'
  | 'setNotice'
  | 'setError'
  | 'loadedDraft'
  | 'setDraftConflict'
  | 'setSnapshot'
  | 'setMetadata'
  | 'setDirty'
  | 'setGeneration'
>;
export function ConfigurationSessionContent({
  section,
  controllerId,
  metadata,
  generation,
  reviewDisabled,
  draft,
  setRevisionBusy,
  setInitialized,
  setNotice,
  setError,
  loadedDraft,
  setDraftConflict,
  setSnapshot,
  setMetadata,
  setDirty,
  setGeneration,
}: Props) {
  return (
    <div hidden={section !== 'review' && section !== 'history'}>
      <Card>
        <Card.Content>
          <ConfigurationRevisions
            controllerId={controllerId}
            metadata={metadata}
            generation={generation}
            disabled={reviewDisabled}
            hasSavedDraft={!!draft.data}
            view={section === 'history' ? 'history' : 'review'}
            onBusyChange={setRevisionBusy}
            onRollback={async (failure) => {
              try {
                const refreshed = await draft.refetch({ throwOnError: true });
                const value = refreshed.data ? JSON.parse(refreshed.data.snapshot) : emptyConfiguration;
                if (
                  value.version !== 1 ||
                  !Array.isArray(value.physicalPoints) ||
                  !Array.isArray(value.logicalChannels)
                ) {
                  setInitialized(false);
                  setNotice('');
                  setError({ key: 'editor.unsupported' });
                  return;
                }
                loadedDraft.current = draftIdentity(refreshed.data);
                setDraftConflict(false);
                setSnapshot(value);
                setMetadata(readMetadata(refreshed.data?.presetProvenance ?? null));
                setDirty(false);
                setGeneration((value) => value + 1);
                setNotice({ key: 'editor.rollbackReloaded' });
                setError(
                  failure ? (failure instanceof Error ? failure.message : { key: 'editor.rollbackFailed' }) : null,
                );
              } catch (error) {
                setInitialized(false);
                setNotice('');
                setError({
                  key: 'editor.reconcileError',
                  data: { error: error instanceof Error ? error.message : '' },
                });
              } finally {
                setRevisionBusy(false);
              }
            }}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
