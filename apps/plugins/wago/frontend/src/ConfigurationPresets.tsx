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
import { boundMeasurement, emptyModbus } from './modbus-editor';
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
  const compatibleChannels = snapshot.logicalChannels.filter((item) => {
    const point = snapshot.physicalPoints.find((point) => point.id === item.physicalPointId);
    if (presetId === 'metered-switched-load') {
      const measurement = boundMeasurement(snapshot.modbus ?? emptyModbus, point?.modbus);
      return !!point?.modbus?.actionId && measurement?.unit === 'watt' && measurement.kind === 'live';
    }
    return (
      (isEditableDigitalChannel(snapshot, item) || (point?.hardwareProfile === 'modbus' && !!point.modbus?.actionId)) &&
      item.capabilities.includes(presetId === 'generic-monitored-input' ? 'input' : 'output')
    );
  });
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
  const canCopy = !!result && !result.errors.length && (!result.diff.length || !!paths.length) && !busy;
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
    if (!result || !canCopy) return;
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
        options={(presets.data ?? []).map((item) => ({ id: item.id, label: item.name }))}
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
        <p>
          {presetId === 'metered-switched-load'
            ? 'Bind a live power measurement and a named output action to the same Modbus point to use this preset.'
            : `Add a digital ${presetId === 'generic-monitored-input' ? 'input' : 'output'} or a compatible Modbus output to use this preset.`}
        </p>
      )}
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
            isDisabled={!canCopy}
            isPending={apply.isPending}
            onPress={() => void copyChanges()}
          >
            {result.diff.length ? 'Copy selected changes to local edits' : 'Reapply preset to local edits'}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
