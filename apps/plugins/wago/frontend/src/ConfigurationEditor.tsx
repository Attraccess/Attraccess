import { Alert, Button, Card, Chip, Form, Modal } from '@heroui/react';
import { ArrowLeft, ArrowRight, GitCompareArrows, History, Network, Settings2, Activity } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConfigurationEditorMetadata, WagoConfigurationDraft, WagoConfigurationSnapshot } from './api';
import { useConfigurationActions, useConfigurationBaselineQuery, useDraftQuery, useSaveDraftMutation } from './queries';
import { emptyConfiguration, emptyMetadata, metadataForSnapshot, readMetadata } from './configuration-model';
import { ChannelWorkspace } from './ChannelWorkspace';
import { ConfigurationPresets } from './ConfigurationPresets';
import { ConfigurationRevisions } from './ConfigurationRevisions';
import { ConfigurationErrors } from './ConfigurationChanges';
import { ModbusConfigurationForm } from './ModbusConfigurationForm';
import { ModbusChannels } from './ModbusChannels';
import { addModbusChannel, emptyModbus, updateModbusConfiguration } from './modbus-editor';
import { validateModbus, validateModbusBindings } from '../../modbus/model';
import { ControllerDiagnostics } from './ControllerDiagnostics';
import { useWagoDiagnostics } from './diagnostics';

type Section = 'channels' | 'devices' | 'review' | 'history' | 'diagnostics';
interface WorkingCopy {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  source: string | null;
}
function draftIdentity(draft: WagoConfigurationDraft | null | undefined) {
  return draft ? JSON.stringify([draft.updatedAt, draft.snapshot, draft.presetProvenance]) : 'empty';
}

/** Full-page workspace; the host route owns navigation and authorization. */
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
  const client = useQueryClient();
  const localKey = ['wago', 'configuration-working-copy', controllerId] as const;
  const [restored] = useState(() => client.getQueryData<WorkingCopy>(localKey));
  const draft = useDraftQuery(controllerId);
  const baseline = useConfigurationBaselineQuery(controllerId, draft.isSuccess && draft.data === null);
  const diagnostics = useWagoDiagnostics(controllerId);
  const [section, setSection] = useState<Section>('channels');
  const [focusChannelId, setFocusChannelId] = useState<string>();
  const save = useSaveDraftMutation(controllerId);
  const { validate } = useConfigurationActions(controllerId);
  const [snapshot, setSnapshot] = useState<WagoConfigurationSnapshot>(restored?.snapshot ?? emptyConfiguration);
  const [metadata, setMetadata] = useState<ConfigurationEditorMetadata>(restored?.metadata ?? emptyMetadata);
  const [initialized, setInitialized] = useState(!!restored);
  const [dirty, setDirty] = useState(!!restored);
  const [draftConflict, setDraftConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const editVersion = useRef(0);
  const loadedDraft = useRef<string | null>(restored?.source ?? null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.isPending || draft.isError || (draft.data === null && !baseline.isSuccess)) return;
    const incoming = draftIdentity(draft.data);
    if (incoming === loadedDraft.current) return;
    if (initialized && dirty) {
      setDraftConflict(true);
      return;
    }
    try {
      const source = draft.data ?? baseline.data;
      const value = source ? JSON.parse(source.snapshot) : emptyConfiguration;
      if (value.version !== 1 || !Array.isArray(value.physicalPoints) || !Array.isArray(value.logicalChannels))
        throw new Error('This draft has an unsupported configuration structure.');
      setSnapshot(value);
      setMetadata(readMetadata((draft.data ?? baseline.data)?.presetProvenance ?? null));
      setInitialized(true);
      setDirty(false);
      setDraftConflict(false);
      loadedDraft.current = incoming;
      setGeneration((value) => value + 1);
    } catch (error) {
      setInitialized(false);
      setError(error instanceof Error ? error.message : 'Could not read draft.');
    }
  }, [draft.data, draft.isPending, draft.isError, dirty, initialized, baseline.data, baseline.isSuccess]);
  useEffect(() => {
    client.setQueryDefaults(['wago', 'configuration-working-copy'], { gcTime: Infinity });
  }, [client]);
  useEffect(() => {
    if (dirty) client.setQueryData(localKey, { snapshot, metadata, source: loadedDraft.current });
    else client.removeQueries({ queryKey: localKey, exact: true });
  }, [snapshot, metadata, dirty, client, controllerId]);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);
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
  function editMetadata(value: ConfigurationEditorMetadata) {
    changed();
    setMetadata(value);
  }
  const modbusErrors = [
    ...(snapshot.modbus ? validateModbus(snapshot.modbus) : []),
    ...validateModbusBindings(snapshot),
  ];
  async function saveDraft() {
    if (busy || draftConflict || modbusErrors.length) return;
    const savingVersion = editVersion.current;
    setError(null);
    setNotice('');
    try {
      const result = await validate.mutateAsync(snapshot);
      if (!mounted.current || savingVersion !== editVersion.current || !result.valid) return;
      const savedMetadata = metadataForSnapshot(snapshot, metadata);
      const saved = await save.mutateAsync({
        snapshot,
        metadata: savedMetadata,
        expectedDraft: draft.data
          ? {
              snapshot: draft.data.snapshot,
              presetProvenance: draft.data.presetProvenance,
              updatedAt: draft.data.updatedAt,
            }
          : null,
      });
      loadedDraft.current = draftIdentity(saved);
      if (!mounted.current || savingVersion !== editVersion.current) return;
      setDirty(false);
      setDraftConflict(false);
      setMetadata(savedMetadata);
      setNotice('Draft saved. Review and publish separately to send it to the controller.');
      setGeneration((value) => value + 1);
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : 'Could not save draft.');
        void draft.refetch();
      }
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
  const editingDisabled = busy || draftConflict || !initialized;
  const reviewDisabled =
    dirty ||
    draftConflict ||
    modbusErrors.length > 0 ||
    save.isPending ||
    validate.isPending ||
    presetBusy ||
    !initialized;
  return (
    <main
      className="wg:mx-auto wg:flex wg:w-full wg:max-w-[1440px] wg:min-w-0 wg:flex-col wg:gap-5 wg:p-4 wg:md:p-6"
      aria-label="Controller configuration"
    >
      <header className="wg:flex wg:flex-col wg:gap-4">
        <Button variant="ghost" isDisabled={busy} onPress={close}>
          <ArrowLeft className="wg:size-4" /> WAGO controllers
        </Button>
        <div className="wg:flex wg:flex-wrap wg:items-start wg:justify-between wg:gap-4">
          <div>
            <p className="wg:text-sm wg:font-medium wg:text-muted">
              WAGO / {diagnostics.data?.name ?? `Controller ${controllerId}`}
            </p>
            <h1 className="wg:mt-1 wg:text-3xl wg:font-semibold">Controller configuration</h1>
            <p className="wg:mt-2 wg:text-muted">
              Give each connection a purpose. Review changes before they reach your controller.
            </p>
          </div>
          {diagnostics.data && <Chip variant="soft">Runtime {diagnostics.data.runtimeVersion}</Chip>}
        </div>
      </header>
      <div className="wg:sticky wg:top-0 wg:z-10 wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-3 wg:rounded-xl wg:border wg:border-border wg:bg-surface wg:p-4">
        <div>
          <p role="status" className="wg:font-medium">
            {dirty
              ? 'Unsaved local edits'
              : draft.data
                ? 'Draft is saved'
                : baseline.data
                  ? `Starting from applied revision ${baseline.data.revision}`
                  : 'No saved draft yet'}
          </p>
          <p className="wg:text-sm wg:text-muted">
            {snapshot.logicalChannels.length} channels · {snapshot.modbus?.devices.length ?? 0} external devices
          </p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button
            variant="secondary"
            isDisabled={editingDisabled || modbusErrors.length > 0}
            isPending={save.isPending || validate.isPending}
            onPress={() => void saveDraft()}
          >
            Save draft
          </Button>
          <Button isDisabled={busy || !initialized} onPress={() => setSection('review')}>
            Review changes <ArrowRight className="wg:size-4" />
          </Button>
        </div>
      </div>
      {draft.isPending && <p role="status">Loading draft…</p>}
      {draft.isError && (
        <p role="alert">
          Could not load draft: {draft.error.message}{' '}
          <Button variant="secondary" onPress={() => void draft.refetch()}>
            Retry loading draft
          </Button>
        </p>
      )}
      {draft.data === null && baseline.isPending && <p role="status">Loading applied configuration…</p>}
      {draft.data === null && baseline.isError && (
        <p role="alert">
          Could not load applied configuration: {baseline.error.message}{' '}
          <Button variant="secondary" onPress={() => void baseline.refetch()}>
            Retry loading configuration
          </Button>
        </p>
      )}
      {draftConflict && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Saved draft changed</Alert.Title>
            <Alert.Description>
              Another editor saved a newer draft. Your local edits are preserved here. Reload the saved draft before
              editing or publishing.
            </Alert.Description>
            <Button variant="secondary" onPress={reloadSavedDraft}>
              Reload saved draft
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {(error || validate.error) && <p role="alert">{error ?? validate.error?.message}</p>}
      {notice && <p role="status">{notice}</p>}
      {validate.data && !validate.data.valid && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>Resolve these configuration fields</Alert.Title>
            <ConfigurationErrors errors={validate.data.errors} snapshot={snapshot} names={metadata.names} />
          </Alert.Content>
        </Alert>
      )}
      <nav
        className="wg:flex wg:flex-wrap wg:gap-2 wg:border-b wg:border-border wg:pb-3"
        aria-label="Controller configuration sections"
      >
        {(
          [
            { id: 'channels', label: 'Channels', icon: Settings2 },
            { id: 'devices', label: 'External devices', icon: Network },
            { id: 'review', label: 'Review & publish', icon: GitCompareArrows },
            { id: 'history', label: 'History', icon: History },
            { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            variant={section === item.id ? 'secondary' : 'ghost'}
            aria-current={section === item.id ? 'page' : undefined}
            isDisabled={busy}
            onPress={() => setSection(item.id)}
          >
            <item.icon className="wg:size-4" />
            {item.label}
          </Button>
        ))}
      </nav>
      {initialized && (
        <>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <fieldset disabled={editingDisabled} inert={editingDisabled} className="wg:min-w-0">
              <legend className="wg:sr-only">I/O configuration</legend>
              <div hidden={section !== 'channels'}>
                <ChannelWorkspace
                  focusChannelId={focusChannelId}
                  snapshot={snapshot}
                  metadata={metadata}
                  onChange={edit}
                  onMetadataChange={editMetadata}
                  onExternal={() => setSection('devices')}
                />
                <details className="wg:mt-5 wg:rounded-xl wg:border wg:border-border wg:p-4">
                  <summary className="wg:cursor-pointer wg:font-medium">Apply a preset to an existing channel</summary>
                  <div className="wg:mt-4 wg:max-w-3xl">
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
                  </div>
                </details>
              </div>
              <div hidden={section !== 'devices'} className="wg:rounded-xl wg:border wg:border-border wg:p-4">
                <ModbusConfigurationForm
                  value={snapshot.modbus ?? emptyModbus}
                  focused
                  showIdentifiers={false}
                  showValidationErrors={false}
                  collapseProfiles
                  isDisabled={editingDisabled}
                  onChange={(modbus) => edit(updateModbusConfiguration(snapshot, modbus))}
                  deviceChannels={(deviceId) => (
                    <ModbusChannels
                      deviceId={deviceId}
                      configuration={snapshot.modbus ?? emptyModbus}
                      onAdd={(binding, name) => {
                        const next = addModbusChannel(snapshot, binding);
                        setFocusChannelId(next.channel.id);
                        edit(next.snapshot);
                        setMetadata((current) => ({
                          ...current,
                          names: {
                            ...current.names,
                            [next.channel.id]: name.slice(0, 120),
                            [next.point.id]: name.slice(0, 120),
                          },
                        }));
                        setNotice(`Added ${name} to Channels. Save the draft when ready.`);
                      }}
                    />
                  )}
                />
              </div>
            </fieldset>
          </Form>
          {modbusErrors.length > 0 && (
            <Card>
              <Card.Header>
                <Card.Title>Configuration needs attention</Card.Title>
                <Card.Description>Resolve these assignments or device settings before saving.</Card.Description>
              </Card.Header>
              <Card.Content>
                <ConfigurationErrors errors={modbusErrors} snapshot={snapshot} names={metadata.names} />
              </Card.Content>
            </Card>
          )}
          <div hidden={section !== 'review'} className="wg:space-y-4">
            <Card>
              <Card.Header>
                <Card.Title>Check, save, then publish</Card.Title>
                <Card.Description>
                  Your edits reach the controller only after you publish a reviewed draft.
                </Card.Description>
              </Card.Header>
              <Card.Content className="wg:flex wg:flex-col wg:gap-3">
                {dirty && <p>Save your local edits before reviewing the draft.</p>}
                {!draft.data && !dirty && <p>Save this configuration as a draft to review and publish it.</p>}
                <Button
                  variant="secondary"
                  isDisabled={busy || draftConflict}
                  onPress={() => {
                    setError(null);
                    void validate.mutateAsync(snapshot).catch((error) => setError(error.message));
                  }}
                >
                  Validate local edits
                </Button>
                {validate.data?.valid && (
                  <div role="status">
                    {validate.data.valid ? 'Configuration contract is valid.' : 'Resolve these configuration fields:'}
                    <ConfigurationErrors errors={validate.data.errors} snapshot={snapshot} names={metadata.names} />
                  </div>
                )}
              </Card.Content>
            </Card>
          </div>
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
                      )
                        throw new Error('This draft has an unsupported configuration structure.');
                      loadedDraft.current = draftIdentity(refreshed.data);
                      setDraftConflict(false);
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
              </Card.Content>
            </Card>
          </div>
        </>
      )}
      <div hidden={section !== 'diagnostics'}>
        <ControllerDiagnostics controllerId={controllerId} />
      </div>
      <Modal isOpen={discard} onOpenChange={setDiscard}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Discard unsaved local edits?</Modal.Heading>
              </Modal.Header>
              <Modal.Body>Your last saved draft will remain available.</Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    client.removeQueries({ queryKey: localKey, exact: true });
                    onClose();
                  }}
                >
                  Discard edits and close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  );
}
