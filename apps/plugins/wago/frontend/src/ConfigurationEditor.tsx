import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { PresetPreview, WagoPreset, WagoPresetApplication } from './api';
import { useApplyPresetMutation, useDraftQuery, usePresetsQuery, usePreviewPresetMutation, useSaveDraftMutation } from './queries';

const emptySnapshot = { version: 1, physicalPoints: [], logicalChannels: [] };

export function ConfigurationEditor({ controllerId, onOpenChange }: { controllerId: number | null; onOpenChange: (open: boolean) => void }) {
  const draftQuery = useDraftQuery(controllerId);
  const presetsQuery = usePresetsQuery();
  const [snapshot, setSnapshot] = useState(JSON.stringify(emptySnapshot, null, 2));
  const [preset, setPreset] = useState<WagoPreset | null>(null);
  const [channelId, setChannelId] = useState('channel-1');
  const [physicalPointId, setPhysicalPointId] = useState('point-1');
  const [guardChannelId, setGuardChannelId] = useState('');
  const [feedbackChannelId, setFeedbackChannelId] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [presetPreview, setPresetPreview] = useState<PresetPreview | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const previewGeneration = useRef(0);
  const saveDraft = useSaveDraftMutation(controllerId ?? 0);
  const previewPreset = usePreviewPresetMutation(controllerId ?? 0);
  const applyPreset = useApplyPresetMutation(controllerId ?? 0);

  useEffect(() => {
    setSnapshot(JSON.stringify(emptySnapshot, null, 2));
  }, [controllerId]);

  useEffect(() => {
    if (draftQuery.data) setSnapshot(JSON.stringify(JSON.parse(draftQuery.data.snapshot), null, 2));
    else if (!draftQuery.isPending) setSnapshot(JSON.stringify(emptySnapshot, null, 2));
  }, [draftQuery.data, draftQuery.isPending]);

  useEffect(() => {
    previewGeneration.current += 1;
    previewPreset.reset();
    setSelectedPaths([]);
    setPresetPreview(null);
  }, [controllerId, preset, channelId, physicalPointId, guardChannelId, feedbackChannelId]);

  function application(): WagoPresetApplication | null {
    if (!preset) return null;
    return {
      presetId: preset.id,
      channelId,
      physicalPointId,
      ...(guardChannelId ? { guardChannelId } : {}),
      ...(feedbackChannelId ? { feedbackChannelId } : {}),
    };
  }

  function parsedSnapshot(): unknown {
    return JSON.parse(snapshot);
  }

  async function preview() {
    const generation = previewGeneration.current;
    try {
      setFormError(null);
      const selected = application();
      if (!selected || draftQuery.isPending) return;
      await saveDraft.mutateAsync(parsedSnapshot());
      const result = await previewPreset.mutateAsync(selected);
      if (generation !== previewGeneration.current) return;
      setPresetPreview(result);
      setSelectedPaths(result.diff.map((change) => change.path));
    } catch (error) {
      if (generation === previewGeneration.current)
        setFormError(error instanceof Error ? error.message : 'Could not preview preset changes.');
    }
  }

  async function apply() {
    const generation = previewGeneration.current;
    try {
      setFormError(null);
      const selected = application();
      if (!selected || draftQuery.isPending) return;
      const draft = await applyPreset.mutateAsync({ application: selected, selectedPaths, previewedDraftHash: presetPreview?.draftHash ?? '' });
      if (generation !== previewGeneration.current) return;
      setSnapshot(JSON.stringify(JSON.parse(draft.snapshot), null, 2));
      previewPreset.reset();
      setPresetPreview(null);
    } catch (error) {
      if (generation === previewGeneration.current)
        setFormError(error instanceof Error ? error.message : 'Could not apply preset changes.');
    }
  }

  const error = saveDraft.error ?? applyPreset.error;
  return (
    <Modal isOpen={controllerId !== null} onOpenChange={onOpenChange}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader><ModalHeading>Controller configuration</ModalHeading></ModalHeader>
            <Form onSubmit={(event) => { event.preventDefault(); if (draftQuery.isPending) return; try { setFormError(null); void saveDraft.mutateAsync(parsedSnapshot()).catch((error) => setFormError(error instanceof Error ? error.message : 'Could not save draft.')); } catch (error) { setFormError(error instanceof Error ? error.message : 'Configuration must be valid JSON.'); } }}>
              <ModalBody className="wg:flex wg:max-h-[75vh] wg:flex-col wg:gap-4 wg:overflow-y-auto">
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Operational controls only</Alert.Title>
                    <Alert.Description>Guards and enable requests are not certified electrical safety functions and must not replace them.</Alert.Description>
                  </Alert.Content>
                </Alert>
                <TextField className="wg:w-full">
                  <Label>Editable configuration draft</Label>
                  <TextArea isDisabled={draftQuery.isPending} value={snapshot} onChange={(event) => { previewGeneration.current += 1; previewPreset.reset(); setSelectedPaths([]); setPresetPreview(null); setSnapshot(event.target.value); }} rows={14} className="wg:font-mono" />
                </TextField>
                <Card>
                  <Card.Header><h2 className="wg:font-medium">Apply editable preset foundation</h2></Card.Header>
                  <Card.Content className="wg:flex wg:flex-col wg:gap-3">
                    <div className="wg:flex wg:flex-wrap wg:gap-2">
                      {presetsQuery.data?.map((item) => (
                        <Button key={item.id} size="sm" variant={preset?.id === item.id ? 'primary' : 'secondary'} onPress={() => setPreset(item)}>
                          {item.name}
                        </Button>
                      ))}
                    </div>
                    {preset && <p className="wg:text-sm wg:text-muted">{preset.description}</p>}
                    <TextField isRequired><Label>Logical channel ID</Label><Input value={channelId} onChange={(event) => setChannelId(event.target.value)} /></TextField>
                    <TextField isRequired><Label>Physical point ID</Label><Input value={physicalPointId} onChange={(event) => setPhysicalPointId(event.target.value)} /></TextField>
                    {preset?.id === 'guarded-enable-request' && <TextField isRequired><Label>Guard input channel ID</Label><Input value={guardChannelId} onChange={(event) => setGuardChannelId(event.target.value)} /></TextField>}
                    {preset?.id === 'generic-digital-output' && <TextField><Label>Optional feedback channel ID</Label><Input value={feedbackChannelId} onChange={(event) => setFeedbackChannelId(event.target.value)} /></TextField>}
                    <Button isDisabled={!preset || draftQuery.isPending} isPending={saveDraft.isPending || previewPreset.isPending} onPress={() => void preview()}>Preview changes</Button>
                    {presetPreview && (
                      <div className="wg:flex wg:flex-col wg:gap-2">
                        <p className="wg:text-sm wg:font-medium">Select preset changes to copy into this draft</p>
                        {presetPreview.diff.map((change) => (
                          <Checkbox key={change.path} isSelected={selectedPaths.includes(change.path)} onChange={(selected) => setSelectedPaths((paths) => selected ? [...paths, change.path] : paths.filter((path) => path !== change.path))}>
                            <code>{change.path}</code>
                          </Checkbox>
                        ))}
                        <Button isDisabled={draftQuery.isPending} isPending={applyPreset.isPending} onPress={() => void apply()}>Apply selected changes</Button>
                      </div>
                    )}
                  </Card.Content>
                </Card>
                {draftQuery.data?.presetProvenance && <p className="wg:text-xs wg:text-muted">Preset provenance: {draftQuery.data.presetProvenance}</p>}
                {(formError || error) && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{formError ?? (error instanceof Error ? error.message : 'Could not update the draft.')}</Alert.Description></Alert.Content></Alert>}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={() => onOpenChange(false)}>Close</Button>
                <Button type="submit" isDisabled={draftQuery.isPending} isPending={saveDraft.isPending}>Save draft</Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
