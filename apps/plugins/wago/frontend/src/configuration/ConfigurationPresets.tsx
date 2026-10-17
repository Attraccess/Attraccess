import { Button } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type {
  ConfigurationEditorMetadata,
  PresetPreview,
  WagoConfigurationSnapshot,
  WagoPresetApplication,
} from '../api/client';
import { useApplyPresetMutation, usePresetsQuery, usePreviewPresetMutation } from '../api/queries';
import { Choice } from './channels/DigitalChannelEditor';
import { ConfigurationChanges, ConfigurationErrors } from './ConfigurationChanges';
import { boundMeasurement, emptyModbus } from './modbus/modbus-editor';
import { isEditableDigitalChannel } from '../../../backend/configuration/digital';
import { useWagoTranslations } from '../i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';

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
  const { t, tExists, tMessage } = useWagoTranslations();
  const presets = usePresetsQuery();
  const preview = usePreviewPresetMutation(controllerId);
  const apply = useApplyPresetMutation();
  const [presetId, setPresetId] = useState<WagoPresetApplication['presetId']>('generic-digital-output');
  const [channelId, setChannelId] = useState('');
  const [guardChannelId, setGuardChannelId] = useState('');
  const [feedbackChannelId, setFeedbackChannelId] = useState('');
  const [result, setResult] = useState<PresetPreview | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [processing, setProcessing] = useState(false);
  const generation = useRef(0);
  const busy = processing;
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
    setProcessing(true);
    try {
      const next = await preview.mutateAsync({ application, snapshot });
      if (current !== generation.current) return;
      setResult(next);
      setPaths(next.diff.map((change) => change.path));
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : { key: 'presets.previewError' });
    } finally {
      setProcessing(false);
    }
  }
  async function copyChanges() {
    if (!result || !canCopy) return;
    const current = generation.current;
    setError(null);
    setProcessing(true);
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
      if (current === generation.current)
        setError(error instanceof Error ? error.message : { key: 'presets.copyError' });
    } finally {
      setProcessing(false);
    }
  }
  return (
    <fieldset className="wg:flex wg:flex-col wg:gap-3">
      <legend className="wg:font-medium">{t('presets.title')}</legend>
      <p>{t('presets.description')}</p>
      {presets.isError && <p role="alert">{t('presets.loadError', { error: presets.error.message })}</p>}
      <Choice
        label={t('presets.preset')}
        value={presetId}
        options={(presets.data ?? []).map((item) => ({
          id: item.id,
          label: tExists(`presets.items.${item.id}.name`) ? t(`presets.items.${item.id}.name`) : item.name,
        }))}
        onChange={(id) => {
          setPresetId(id as typeof presetId);
          setChannelId('');
        }}
      />
      <p>
        {tExists(`presets.items.${presetId}.description`)
          ? t(`presets.items.${presetId}.description`)
          : presets.data?.find((item) => item.id === presetId)?.description}
      </p>
      <Choice
        label={t('presets.applyTo')}
        value={target?.id ?? ''}
        options={compatibleChannels.map((item) => ({ id: item.id, label: metadata.names[item.id] ?? item.id }))}
        onChange={setChannelId}
      />
      {!compatibleChannels.length && (
        <p>
          {presetId === 'metered-switched-load'
            ? t('presets.meteredHint')
            : t('presets.digitalHint', {
                direction: t(presetId === 'generic-monitored-input' ? 'channels.input' : 'channels.output'),
              })}
        </p>
      )}
      {presetId === 'guarded-enable-request' && (
        <Choice label={t('channels.guardInput')} value={guardChannelId} options={inputs} onChange={setGuardChannelId} />
      )}
      {presetId === 'generic-digital-output' && (
        <Choice
          label={t('presets.feedback')}
          value={feedbackChannelId || 'none'}
          options={[{ id: 'none', label: t('presets.noFeedback') }, ...inputs]}
          onChange={(value) => setFeedbackChannelId(value === 'none' ? '' : value)}
        />
      )}
      <Button
        variant="secondary"
        isDisabled={!target || (presetId === 'guarded-enable-request' && !guardChannelId) || apply.isPending}
        isPending={preview.isPending}
        onPress={() => void showPreview()}
      >
        {t('presets.preview')}
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
          <Button isDisabled={!canCopy} isPending={apply.isPending} onPress={() => void copyChanges()}>
            {t(result.diff.length ? 'presets.copy' : 'presets.reapply')}
          </Button>
        </>
      )}
      {error && <p role="alert">{tMessage(error)}</p>}
    </fieldset>
  );
}
