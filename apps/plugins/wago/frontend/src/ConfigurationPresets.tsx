import { Button } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type {
  ConfigurationEditorMetadata,
  PresetPreview,
  WagoConfigurationSnapshot,
  WagoPresetApplication,
} from './api';
import { useApplyPresetMutation, usePresetsQuery, usePreviewPresetMutation } from './queries';
import { Choice } from './DigitalChannelEditor';
import { ConfigurationChanges, ConfigurationErrors } from './ConfigurationChanges';
import { isEditableDigitalChannel } from '../../backend/configuration-digital';

export function ConfigurationPresets({
  controllerId,
  snapshot,
  metadata,
  onApply,
  onBusyChange,
}: {
  controllerId: number;
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onApply: (snapshot: WagoConfigurationSnapshot, application: WagoPresetApplication) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const presets = usePresetsQuery();
  const preview = usePreviewPresetMutation(controllerId);
  const apply = useApplyPresetMutation();
  const [presetId, setPresetId] = useState<WagoPresetApplication['presetId']>('generic-digital-output');
  const [channelId, setChannelId] = useState('');
  const [guardChannelId, setGuardChannelId] = useState('');
  const [feedbackChannelId, setFeedbackChannelId] = useState('');
  const [result, setResult] = useState<PresetPreview | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const busy = preview.isPending || apply.isPending;
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    generation.current++;
    setResult(null);
    setError(null);
  }, [snapshot, presetId, channelId, guardChannelId, feedbackChannelId]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const compatibleChannels = snapshot.logicalChannels.filter(
    (item) =>
      isEditableDigitalChannel(snapshot, item) &&
      item.capabilities.includes(presetId === 'generic-monitored-input' ? 'input' : 'output'),
  );
  const target = compatibleChannels.find((item) => item.id === channelId);
  const inputs = snapshot.logicalChannels
    .filter((item) => item.id !== channelId && item.capabilities.includes('input'))
    .map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }));
  const application: WagoPresetApplication = {
    presetId,
    channelId,
    physicalPointId: target?.physicalPointId ?? '',
    ...(guardChannelId ? { guardChannelId } : {}),
    ...(feedbackChannelId ? { feedbackChannelId } : {}),
  };
  async function showPreview() {
    const current = generation.current;
    setError(null);
    try {
      const next = await preview.mutateAsync({ application, snapshot });
      if (current !== generation.current) return;
      setResult(next);
      setPaths(next.diff.map((change) => change.path));
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : 'Could not preview preset.');
    }
  }
  async function copyChanges() {
    if (!result) return;
    const current = generation.current;
    setError(null);
    try {
      const next = await apply.mutateAsync({
        controllerId,
        application,
        snapshot,
        selectedPaths: paths,
        previewedDraftHash: result.draftHash,
      });
      if (current !== generation.current) return;
      onApply(JSON.parse(next.snapshot), application);
      setResult(null);
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : 'Could not copy preset.');
    }
  }
  return (
    <fieldset className="wg:flex wg:flex-col wg:gap-3">
      <legend className="wg:font-medium">Preset foundation</legend>
      <p>Preview settings, then copy selected changes into your local edits. Save draft when ready.</p>
      {presets.isError && <p role="alert">Could not load presets: {presets.error.message}</p>}
      <Choice
        label="Preset"
        value={presetId}
        options={(presets.data ?? [])
          .filter((item) => item.id !== 'metered-switched-load')
          .map((item) => ({ id: item.id, label: item.name }))}
        onChange={(id) => {
          setPresetId(id as typeof presetId);
          setChannelId('');
        }}
      />
      <p>{presets.data?.find((item) => item.id === presetId)?.description}</p>
      <Choice
        label="Apply to channel"
        value={target?.id ?? ''}
        options={compatibleChannels.map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }))}
        onChange={setChannelId}
      />
      {!compatibleChannels.length && (
        <p>Add a digital {presetId === 'generic-monitored-input' ? 'input' : 'output'} to use this preset.</p>
      )}
      <p>
        Metered switched loads remain available in existing configurations. New metered loads require the Modbus editor
        integration.
      </p>
      {presetId === 'guarded-enable-request' && (
        <Choice label="Guard input" value={guardChannelId} options={inputs} onChange={setGuardChannelId} />
      )}
      {presetId === 'generic-digital-output' && (
        <Choice
          label="Optional feedback input"
          value={feedbackChannelId || 'none'}
          options={[{ id: 'none', label: 'No feedback' }, ...inputs]}
          onChange={(value) => setFeedbackChannelId(value === 'none' ? '' : value)}
        />
      )}
      <Button
        variant="secondary"
        isDisabled={!target || (presetId === 'guarded-enable-request' && !guardChannelId) || apply.isPending}
        isPending={preview.isPending}
        onPress={() => void showPreview()}
      >
        Preview preset
      </Button>
      {result && (
        <>
          <ConfigurationChanges
            changes={result.diff}
            before={snapshot}
            after={result.snapshot}
            names={metadata.names}
            selected={paths}
            onSelect={(path, selected) =>
              setPaths((previous) => (selected ? [...previous, path] : previous.filter((item) => item !== path)))
            }
          />
          <ConfigurationErrors errors={result.errors} snapshot={result.snapshot} names={metadata.names} />
          <Button
            isDisabled={!paths.length || preview.isPending}
            isPending={apply.isPending}
            onPress={() => void copyChanges()}
          >
            Copy selected changes to local edits
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
