import {
  Alert,
  Button,
  Form,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { useConfigurationActions, useDraftQuery, useSaveDraftMutation } from './queries';
import {
  addDigitalChannel,
  emptyConfiguration,
  emptyMetadata,
  metadataForSnapshot,
  readMetadata,
} from './configuration-model';
import { DigitalChannelEditor, PhysicalAssignments } from './DigitalChannelEditor';
import { ConfigurationPresets } from './ConfigurationPresets';
import { ConfigurationRevisions } from './ConfigurationRevisions';
import { ConfigurationErrors } from './ConfigurationChanges';
import { ControllerDiagnostics } from './ControllerDiagnostics';
import {
  availableDigitalTerminals,
  digitalTerminalLabel,
  isEditableDigitalChannel,
} from '../../backend/configuration-digital';

export function ConfigurationEditor({
  controllerId,
  onOpenChange,
}: {
  controllerId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (controllerId === null) return null;
  return <ConfigurationSession key={controllerId} controllerId={controllerId} onClose={() => onOpenChange(false)} />;
}

function ConfigurationSession({ controllerId, onClose }: { controllerId: number; onClose: () => void }) {
  const draft = useDraftQuery(controllerId);
  const save = useSaveDraftMutation(controllerId);
  const { validate } = useConfigurationActions(controllerId);
  const [snapshot, setSnapshot] = useState<WagoConfigurationSnapshot>(emptyConfiguration);
  const [metadata, setMetadata] = useState<ConfigurationEditorMetadata>(emptyMetadata);
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const editVersion = useRef(0);
  const loadedDraft = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.isPending || draft.isError) return;
    const incoming = draft.data
      ? `${draft.data.updatedAt}\u0000${draft.data.snapshot}\u0000${draft.data.presetProvenance ?? ''}`
      : 'empty';
    if (incoming === loadedDraft.current) return;
    if (initialized && dirty) {
      setDraftConflict(true);
      return;
    }
    try {
      const value = draft.data ? JSON.parse(draft.data.snapshot) : emptyConfiguration;
      if (value.version !== 1 || !Array.isArray(value.physicalPoints) || !Array.isArray(value.logicalChannels))
        throw new Error('This draft has an unsupported configuration structure.');
      setSnapshot(value);
      setMetadata(readMetadata(draft.data?.presetProvenance ?? null));
      setInitialized(true);
      setDirty(false);
      setDraftConflict(false);
      loadedDraft.current = incoming;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read draft.');
    }
  }, [draft.data, draft.isPending, draft.isError, dirty, initialized]);
  function changed() {
    editVersion.current++;
    setDirty(true);
    setError(null);
    setNotice('');
    setGeneration((value) => value + 1);
    validate.reset();
  }
  function edit(value: WagoConfigurationSnapshot) {
    changed();
    setSnapshot(value);
  }
  function rename(id: string, name: string) {
    changed();
    setMetadata((current) => ({ ...current, names: { ...current.names, [id]: name } }));
  }
  function add(direction: 'input' | 'output') {
    try {
      const next = addDigitalChannel(snapshot, direction);
      edit(next.snapshot);
      setMetadata((current) => ({
        ...current,
        names: {
          ...current.names,
          [next.channel.id]: `Digital ${direction} ${digitalTerminalLabel(next.point.channel)}`,
          [next.point.id]: digitalTerminalLabel(next.point.channel),
        },
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No terminal available.');
    }
  }
  async function saveDraft() {
    if (busy || draftConflict) return;
    const savingVersion = editVersion.current;
    setError(null);
    setNotice('');
    try {
      const result = await validate.mutateAsync(snapshot);
      if (!mounted.current || savingVersion !== editVersion.current || !result.valid) return;
      const savedMetadata = metadataForSnapshot(snapshot, metadata);
      await save.mutateAsync({ snapshot, metadata: savedMetadata });
      if (!mounted.current || savingVersion !== editVersion.current) return;
      setDirty(false);
      setMetadata(savedMetadata);
      setNotice('Draft saved. Review and publish separately to send it to the controller.');
      setGeneration((value) => value + 1);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Could not save draft.');
    }
  }
  const busy = save.isPending || validate.isPending || revisionBusy || presetBusy;
  function reloadSavedDraft() {
    loadedDraft.current = null;
    setDirty(false);
    setDraftConflict(false);
    void draft.refetch();
  }
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>Controller configuration</ModalHeading>
            </ModalHeader>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                void saveDraft();
              }}
            >
              <ModalBody className="wg:flex wg:max-h-[75vh] wg:flex-col wg:gap-4 wg:overflow-y-auto wg:[&>*]:shrink-0">
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Operational controls only</Alert.Title>
                    <Alert.Description>
                      Guards and enable requests are not certified electrical safety functions and must not replace
                      them.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
                <ControllerDiagnostics controllerId={controllerId} />
                <p>
                  Diagnostics compares controller settings only. Review saved draft below also checks channel names and
                  preset metadata before publication.
                </p>
                {draft.isPending && <p role="status">Loading draft…</p>}
                {draft.isError && <p role="alert">Could not load draft: {draft.error.message}</p>}
                {draftConflict && (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Saved draft changed</Alert.Title>
                      <Alert.Description>
                        Another editor saved a newer draft. Reload it before editing, reviewing, or saving so your local
                        changes do not overwrite it.
                      </Alert.Description>
                      <Button variant="secondary" onPress={reloadSavedDraft}>
                        Reload saved draft
                      </Button>
                    </Alert.Content>
                  </Alert>
                )}
                {initialized && (
                  <>
                    <p role="status">
                      {dirty ? 'Unsaved local edits' : draft.data ? 'Draft is saved' : 'No saved draft yet'} ·{' '}
                      {snapshot.logicalChannels.length} channels
                    </p>
                    <fieldset
                      disabled={busy || draftConflict}
                      inert={busy || draftConflict}
                      className="wg:flex wg:flex-col wg:gap-4"
                    >
                      <legend className="wg:sr-only">Digital configuration</legend>
                      <div className="wg:flex wg:gap-2">
                        <Button
                          variant="secondary"
                          isDisabled={!availableDigitalTerminals(snapshot, 'input').length}
                          onPress={() => add('input')}
                        >
                          Add digital input
                        </Button>
                        <Button
                          variant="secondary"
                          isDisabled={!availableDigitalTerminals(snapshot, 'output').length}
                          onPress={() => add('output')}
                        >
                          Add digital output
                        </Button>
                      </div>
                      <p>
                        {availableDigitalTerminals(snapshot, 'input').length} of 8 input terminals available ·{' '}
                        {availableDigitalTerminals(snapshot, 'output').length} of 4 output terminals available
                      </p>
                      {!snapshot.logicalChannels.length && (
                        <p>Add an input or output, name it, and confirm its physical assignment below.</p>
                      )}
                      {snapshot.logicalChannels.map((channel) =>
                        isEditableDigitalChannel(snapshot, channel) ? (
                          <DigitalChannelEditor
                            key={channel.id}
                            channel={channel}
                            snapshot={snapshot}
                            metadata={metadata}
                            onRename={rename}
                            onChange={(value) =>
                              edit({
                                ...snapshot,
                                logicalChannels: snapshot.logicalChannels.map((item) =>
                                  item.id === value.id ? value : item,
                                ),
                              })
                            }
                            onAssign={(terminal) =>
                              edit({
                                ...snapshot,
                                physicalPoints: snapshot.physicalPoints.map((point) =>
                                  point.id === channel.physicalPointId ? { ...point, channel: terminal } : point,
                                ),
                              })
                            }
                            onRemove={() =>
                              edit({
                                ...snapshot,
                                logicalChannels: snapshot.logicalChannels.filter((item) => item.id !== channel.id),
                              })
                            }
                          />
                        ) : (
                          <section key={channel.id}>
                            <h3>{metadata.names[channel.id] ?? channel.id}</h3>
                            <p>
                              Existing {channel.profile.replaceAll('-', ' ')} configuration is preserved. Editing
                              requires its dedicated hardware/Modbus editor.
                            </p>
                          </section>
                        ),
                      )}
                      <PhysicalAssignments snapshot={snapshot} metadata={metadata} onChange={edit} />
                      <ConfigurationPresets
                        controllerId={controllerId}
                        snapshot={snapshot}
                        metadata={metadata}
                        onBusyChange={setPresetBusy}
                        onApply={(value, application) => {
                          edit(value);
                          setMetadata((current) => ({ ...current, presets: [...current.presets, application] }));
                        }}
                      />
                    </fieldset>
                    <Button
                      variant="secondary"
                      isDisabled={busy}
                      onPress={() => {
                        setError(null);
                        void validate.mutateAsync(snapshot).catch((error) => setError(error.message));
                      }}
                    >
                      Validate local edits
                    </Button>
                    {validate.data && (
                      <div role="status">
                        {validate.data.valid
                          ? 'Configuration contract is valid.'
                          : 'Resolve these configuration fields:'}
                        <ConfigurationErrors errors={validate.data.errors} snapshot={snapshot} names={metadata.names} />
                      </div>
                    )}
                    <ConfigurationRevisions
                      generation={generation}
                      controllerId={controllerId}
                      metadata={metadata}
                      disabled={
                        dirty || draftConflict || save.isPending || validate.isPending || presetBusy || !draft.data
                      }
                      onBusyChange={setRevisionBusy}
                      onRollback={async (failure) => {
                        try {
                          const refreshed = await draft.refetch({ throwOnError: true });
                          const value = refreshed.data ? JSON.parse(refreshed.data.snapshot) : emptyConfiguration;
                          if (
                            value.version !== 1 ||
                            !Array.isArray(value.physicalPoints) ||
                            !Array.isArray(value.logicalChannels)
                          )
                            throw new Error('This draft has an unsupported configuration structure.');
                          setSnapshot(value);
                          setMetadata(readMetadata(refreshed.data?.presetProvenance ?? null));
                          setDirty(false);
                          setGeneration((value) => value + 1);
                          setNotice(
                            'Reloaded the saved draft after the rollback attempt. Check revision history for delivery status.',
                          );
                          setError(failure ? (failure instanceof Error ? failure.message : 'Rollback failed.') : null);
                        } catch (error) {
                          setInitialized(false);
                          setNotice('');
                          setError(
                            `Could not reconcile the saved draft after rollback. Close and reopen the editor before continuing. ${error instanceof Error ? error.message : ''}`,
                          );
                        } finally {
                          setRevisionBusy(false);
                        }
                      }}
                    />
                  </>
                )}
                {(error || validate.error) && <p role="alert">{error ?? validate.error?.message}</p>}
                {notice && <p role="status">{notice}</p>}
                {discard && (
                  <Alert status="warning">
                    <Alert.Content>
                      <Alert.Title>Discard unsaved local edits?</Alert.Title>
                      <Alert.Description>Your last saved draft will remain available.</Alert.Description>
                      <Button variant="danger" onPress={onClose}>
                        Discard edits and close
                      </Button>
                      <Button variant="secondary" onPress={() => setDiscard(false)}>
                        Keep editing
                      </Button>
                    </Alert.Content>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" isDisabled={busy} onPress={close}>
                  Close
                </Button>
                <Button type="submit" isDisabled={!initialized || busy || draftConflict} isPending={save.isPending}>
                  Save draft
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
