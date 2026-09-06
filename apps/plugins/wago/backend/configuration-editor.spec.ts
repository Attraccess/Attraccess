import { applyPreset, validateSnapshot, WAGO_PRESETS, type WagoConfigurationSnapshot } from './configuration';
import {
  configurationImpacts,
  editorMetadata,
  previewConfigurationPreset,
  selectPresetChanges,
  validateEditorSnapshot,
} from './configuration-editor';
import { availableDigitalTerminals, DIGITAL_TERMINALS, isEditableDigitalChannel } from './configuration-digital';
import { addDigitalChannel, changeLabel, emptyConfiguration, readMetadata } from '../frontend/src/configuration-model';

describe('visual configuration editing', () => {
  const base: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [
      { id: 'point-in', hardwareProfile: '751-9301', channel: 4 },
      { id: 'point-out', hardwareProfile: '751-9301', channel: 0 },
      { id: 'point-extra-in', hardwareProfile: '751-9301', channel: 5 },
    ],
    logicalChannels: [
      {
        id: 'input',
        physicalPointId: 'point-in',
        profile: 'generic-monitored-input',
        capabilities: ['input'],
        disconnectPolicy: { mode: 'hold' },
      },
    ],
  };
  it.each(WAGO_PRESETS)('previews and copies the complete $name preset without changing its source', ({ id }) => {
    const application = {
      presetId: id,
      channelId: 'output',
      physicalPointId: id === 'generic-monitored-input' ? 'point-extra-in' : 'point-out',
      guardChannelId: 'input',
      feedbackChannelId: 'input',
    };
    const original = JSON.stringify(base);
    const preview = previewConfigurationPreset(base, application);
    expect(preview.errors).toEqual([]);
    const copied = selectPresetChanges(
      base,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
    );
    expect(copied).toEqual(preview.snapshot);
    expect(validateSnapshot(copied)).toEqual([]);
    expect(JSON.stringify(base)).toBe(original);
  });

  it('rejects stale previews and unknown change paths', () => {
    const application = { presetId: 'pulsed-lock-bank' as const, channelId: 'output', physicalPointId: 'point-out' };
    const preview = previewConfigurationPreset(base, application);
    expect(() => selectPresetChanges(base, application, [], 'old')).toThrow('draft changed');
    expect(() => selectPresetChanges(base, application, ['__proto__.polluted'], preview.draftHash)).toThrow(
      'unknown preset change',
    );
    expect(selectPresetChanges(base, application, [], preview.draftHash)).toEqual(base);
  });

  it('rejects partial preset selection that would break the contract', () => {
    const output = applyPreset(base, {
      presetId: 'generic-digital-output',
      channelId: 'output',
      physicalPointId: 'point-out',
    });
    const application = { presetId: 'pulsed-lock-bank' as const, channelId: 'output', physicalPointId: 'point-out' };
    const preview = previewConfigurationPreset(output, application);
    expect(() => selectPresetChanges(output, application, ['$.logicalChannels[1].profile'], preview.draftHash)).toThrow(
      'requires pulse',
    );
  });

  it('preserves unselected array removals when a preset removes capabilities', () => {
    const output = applyPreset(base, {
      presetId: 'pulsed-lock-bank',
      channelId: 'output',
      physicalPointId: 'point-out',
    });
    const application = {
      presetId: 'generic-digital-output' as const,
      channelId: 'output',
      physicalPointId: 'point-out',
    };
    const preview = previewConfigurationPreset(output, application);
    expect(selectPresetChanges(output, application, [], preview.draftHash)).toEqual(output);
    expect(
      selectPresetChanges(
        output,
        application,
        preview.diff.map((change) => change.path),
        preview.draftHash,
      ),
    ).toEqual(preview.snapshot);
  });

  it('creates unique stable identities and keeps display names out of the runtime snapshot', () => {
    let sequence = 0;
    const nextId = () => String(++sequence);
    const input = addDigitalChannel(emptyConfiguration, 'input', nextId);
    const output = addDigitalChannel(input.snapshot, 'output', nextId);
    expect(output.snapshot.physicalPoints.map((point) => point.channel)).toEqual([4, 0]);
    expect(output.snapshot.logicalChannels.map((channel) => channel.id)).toEqual(['channel-2', 'channel-4']);
    const metadata = editorMetadata({ names: { 'channel-2': 'Door contact' }, presets: [] });
    expect(readMetadata(JSON.stringify({ editor: metadata }))).toEqual(metadata);
    expect(validateSnapshot(output.snapshot)).toEqual([]);
    expect(JSON.stringify(output.snapshot)).not.toContain('Door contact');
    expect(output.snapshot.logicalChannels[0].id).toBe(input.channel.id);
  });

  it('labels preview changes with user names', () => {
    expect(
      changeLabel(
        { path: '$.logicalChannels[0].disconnectPolicy.mode', previous: 'hold', current: 'immediate' },
        base,
        base,
        { input: 'Door contact' },
      ),
    ).toBe('Door contact · On disconnect');
  });

  it('warns about removals, behavior changes and physical reassignment but not reordering', () => {
    expect(configurationImpacts(base, { ...base, physicalPoints: [...base.physicalPoints].reverse() })).toEqual([]);
    expect(configurationImpacts(base, { ...base, logicalChannels: [] })).toEqual([
      expect.objectContaining({ channelId: 'input' }),
    ]);
    expect(
      configurationImpacts(base, {
        ...base,
        physicalPoints: base.physicalPoints.map((point) => ({ ...point, channel: point.channel + 2 })),
      }),
    ).toHaveLength(1);
  });

  it('requires distinct guard inputs and capability settings', () => {
    const value = applyPreset(base, {
      presetId: 'guarded-enable-request',
      channelId: 'output',
      physicalPointId: 'point-out',
      guardChannelId: 'output',
    });
    expect(validateEditorSnapshot(value)).toContainEqual(expect.objectContaining({ code: 'invalid_guard_channel' }));
    expect(() => editorMetadata({ names: { input: '' }, presets: [] })).toThrow('channel names');
  });

  it.each(DIGITAL_TERMINALS)('accepts $label only in its confirmed direction', (terminal) => {
    const created = addDigitalChannel(emptyConfiguration, terminal.direction, () => terminal.label);
    const value = { ...created.snapshot, physicalPoints: [{ ...created.point, channel: terminal.channel }] };
    expect(validateEditorSnapshot(value)).toEqual([]);
    const opposite = addDigitalChannel(
      emptyConfiguration,
      terminal.direction === 'input' ? 'output' : 'input',
      () => 'opposite',
    );
    expect(
      validateEditorSnapshot({
        ...opposite.snapshot,
        physicalPoints: [{ ...opposite.point, channel: terminal.channel }],
      }),
    ).toContainEqual(expect.objectContaining({ code: 'direction_mismatch' }));
  });

  it('enforces all four output and eight input terminals without overflowing into the other direction', () => {
    let value = emptyConfiguration;
    let id = 0;
    for (const direction of ['output', 'input'] as const) {
      const capacity = direction === 'output' ? 4 : 8;
      for (let index = 0; index < capacity; index++)
        value = addDigitalChannel(value, direction, () => String(++id)).snapshot;
      expect(availableDigitalTerminals(value, direction)).toEqual([]);
      expect(() => addDigitalChannel(value, direction)).toThrow(`All digital ${direction} terminals are assigned`);
    }
    expect(validateEditorSnapshot(value)).toEqual([]);
    expect(value.physicalPoints.map((point) => point.channel)).toEqual(
      DIGITAL_TERMINALS.map((terminal) => terminal.channel),
    );
  });

  it('rejects physical collisions, shared points and unsupported terminals', () => {
    const value = addDigitalChannel(emptyConfiguration, 'output', () => 'one').snapshot;
    expect(
      validateEditorSnapshot({
        ...value,
        physicalPoints: [...value.physicalPoints, { ...value.physicalPoints[0], id: 'duplicate' }],
      }),
    ).toContainEqual(expect.objectContaining({ code: 'duplicate_terminal' }));
    expect(
      validateEditorSnapshot({
        ...value,
        logicalChannels: [...value.logicalChannels, { ...value.logicalChannels[0], id: 'duplicate' }],
      }),
    ).toContainEqual(expect.objectContaining({ code: 'duplicate_assignment' }));
    expect(
      validateEditorSnapshot({ ...value, physicalPoints: [{ ...value.physicalPoints[0], channel: 12 }] }),
    ).toContainEqual(expect.objectContaining({ code: 'unsupported_terminal' }));
  });

  it('preserves external points and does not expose them as digital channels', () => {
    const external = {
      ...base,
      physicalPoints: [{ id: 'external', hardwareProfile: '879-3000' as const, channel: 100 }],
      logicalChannels: [{ ...base.logicalChannels[0], physicalPointId: 'external' }],
    };
    expect(isEditableDigitalChannel(external, external.logicalChannels[0])).toBe(false);
    const created = addDigitalChannel(external, 'output', () => 'new');
    expect(created.snapshot.physicalPoints[0]).toEqual(external.physicalPoints[0]);
    expect(created.snapshot.logicalChannels[0]).toEqual(external.logicalChannels[0]);
    expect(validateEditorSnapshot(created.snapshot)).toEqual([]);
  });

  it('rejects guard references to another output and a direction-incompatible preset', () => {
    const output = applyPreset(base, {
      presetId: 'generic-digital-output',
      channelId: 'output',
      physicalPointId: 'point-out',
    });
    const guarded = {
      ...output,
      logicalChannels: output.logicalChannels.map((channel) =>
        channel.id === 'input'
          ? {
              ...channel,
              capabilities: [...channel.capabilities, 'guard' as const],
              guard: { channelId: 'output', when: 'on' as const },
            }
          : channel,
      ),
    };
    expect(validateEditorSnapshot(guarded)).toContainEqual(expect.objectContaining({ code: 'invalid_guard_channel' }));
    expect(
      previewConfigurationPreset(base, {
        presetId: 'generic-digital-output',
        channelId: 'input',
        physicalPointId: 'point-in',
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'direction_mismatch' }));
  });
});
