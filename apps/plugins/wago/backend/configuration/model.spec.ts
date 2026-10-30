import { configurationDiff, configurationHash, validateSnapshot, type WagoConfigurationSnapshot } from './model';
import { meterFleet } from '../../shared/configuration-limits.test-utils';
import { changeLabel, readableStructuralChanges } from '../../frontend/src/configuration/model';

describe('readable structural configuration changes', () => {
  const before: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [
      { id: 'point-a', hardwareProfile: '751-9301', channel: 0 },
      { id: 'point-b', hardwareProfile: '751-9301', channel: 1 },
    ],
    logicalChannels: ['a', 'b'].map((id) => ({
      id,
      physicalPointId: `point-${id}`,
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'immediate' },
    })),
  };
  const names = { a: 'Workshop light', b: 'Door lock', 'point-a': 'Cabinet output A', 'point-b': 'Cabinet output B' };

  it('reports only the removed first channel and point, not changes to the surviving identities', () => {
    const after = {
      ...before,
      logicalChannels: before.logicalChannels.slice(1),
      physicalPoints: before.physicalPoints.slice(1),
    };
    const wire = configurationDiff(before, after);
    const original = JSON.stringify(wire);
    const changes = readableStructuralChanges(wire, before, after);
    expect(changes.map((change) => changeLabel(change, before, after, names))).toEqual([
      'Workshop light · Removed',
      'Cabinet output A · Removed',
    ]);
    expect(changes.map((change) => change.previous)).toEqual([before.logicalChannels[0], before.physicalPoints[0]]);
    expect(changes.every((change) => change.current === undefined)).toBe(true);
    expect(JSON.stringify(wire)).toBe(original);
  });

  it('preserves real edits to shifted survivors and gives each row a unique stable path', () => {
    const after = {
      ...before,
      logicalChannels: [{ ...before.logicalChannels[1], disconnectPolicy: { mode: 'hold' as const } }],
    };
    const changes = readableStructuralChanges(configurationDiff(before, after), before, after);
    expect(changes.map((change) => changeLabel(change, before, after, names))).toEqual([
      'Workshop light · Removed',
      'Door lock · Changed',
    ]);
    expect(new Set(changes.map((change) => change.path)).size).toBe(changes.length);
    expect(changes[1].previous).toEqual(before.logicalChannels[1]);
    expect(changes[1].current).toEqual(after.logicalChannels[0]);
  });

  it('renders rollback additions by identity and ignores reorder-only shifts', () => {
    const after = { ...before, logicalChannels: before.logicalChannels.slice(1) };
    const restored = readableStructuralChanges(configurationDiff(after, before), after, before);
    expect(restored.map((change) => changeLabel(change, after, before, names))).toEqual(['Workshop light · Added']);
    const reordered = { ...before, logicalChannels: [...before.logicalChannels].reverse() };
    expect(readableStructuralChanges(configurationDiff(before, reordered), before, reordered)).toEqual([]);
  });

  it('keeps nonstructural preset field paths and initial configuration diffs unchanged', () => {
    const after = {
      ...before,
      logicalChannels: before.logicalChannels.map((channel) => ({
        ...channel,
        disconnectPolicy: { mode: 'hold' as const },
      })),
    };
    const changes = configurationDiff(before, after);
    expect(readableStructuralChanges(changes, before, after)).toBe(changes);
    const initial = configurationDiff(null, before);
    expect(readableStructuralChanges(initial, null, before)).toBe(initial);
  });
});

/** `configurationHash` of the stored snapshot below, recorded before channels could be disabled. */
const STORED_SNAPSHOT_HASH = '8b060074d02e922a977620449edcdaa2483f896a237238eb5a8a670c3e1b816e';

describe('disabled channels', () => {
  /** Two meters with three readings each, the last one disabled, plus a digital output and input. */
  const fleet = (): WagoConfigurationSnapshot => {
    const meters = meterFleet(2, 2);
    return {
      ...meters,
      physicalPoints: [
        ...meters.physicalPoints.filter((_, index) => index % 131 < 3),
        { id: 'output-1', hardwareProfile: '751-9301', channel: 0 },
        { id: 'input-1', hardwareProfile: '751-9301', channel: 1 },
      ],
      logicalChannels: [
        ...meters.logicalChannels.filter((_, index) => index % 131 < 3),
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'immediate' },
        },
        {
          id: 'door',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
      ],
    };
  };
  const disabledId = meterFleet(1, 0).logicalChannels[2].id;
  const loadIndex = 6;
  const doorIndex = 7;
  const withChannel = (index: number, change: Record<string, unknown>) => {
    const value = fleet();
    value.logicalChannels[index] = { ...value.logicalChannels[index], ...change };
    return value;
  };
  const codes = (value: unknown) => validateSnapshot(value).map((error) => error.code);

  it('accepts enabled: false on a Modbus measurement channel', () => {
    expect(fleet().logicalChannels[2]).toMatchObject({ id: disabledId, enabled: false });
    expect(validateSnapshot(fleet())).toEqual([]);
    expect(validateSnapshot(withChannel(2, { capabilities: ['input', 'measurement'] }))).toEqual([]);
  });

  it('accepts ten built-in 879-3020 meters with 131 channels each and 11 enabled', () => {
    expect(validateSnapshot(meterFleet(10, 11))).toEqual([]);
  });

  it.each([true, 'false', 0, null])('rejects enabled: %p', (enabled) => {
    expect(validateSnapshot(withChannel(0, { enabled }))).toContainEqual({
      path: 'logicalChannels[0].enabled',
      code: 'invalid_enabled',
      message: 'enabled must be false or omitted',
    });
  });

  it.each([
    ['a digital output', loadIndex, {}],
    ['a digital input', doorIndex, {}],
    ['a Modbus channel with output capability', 2, { capabilities: ['measurement', 'output'] }],
  ])('rejects enabled: false on %s', (_name, index, change) => {
    expect(validateSnapshot(withChannel(index, { ...change, enabled: false }))).toContainEqual({
      path: `logicalChannels[${index}].enabled`,
      code: 'invalid_enabled',
      message: 'only Modbus measurement channels without an action can be disabled',
    });
  });

  it('rejects enabled: false on a channel whose Modbus point is bound to an action', () => {
    const value = fleet();
    value.physicalPoints[2] = { ...value.physicalPoints[2], modbus: { deviceId: 'meter-0', actionId: 'relay' } };
    expect(codes(value)).toContain('invalid_enabled');
  });

  it.each([
    ['guard', { capabilities: ['output', 'guard'], guard: { channelId: disabledId, when: 'on' } }],
    [
      'feedback',
      { capabilities: ['output', 'feedback'], feedback: { channelId: disabledId, expected: 'match', timeoutMs: 100 } },
    ],
  ])('rejects a %s that refers to a disabled channel', (key, change) => {
    // The disabled reading is otherwise a valid guard or feedback input.
    const value = withChannel(loadIndex, change);
    value.logicalChannels[2] = { ...value.logicalChannels[2], capabilities: ['input', 'measurement'] };
    expect(validateSnapshot(value)).toEqual([
      {
        path: `logicalChannels[${loadIndex}].${key}.channelId`,
        code: 'disabled_reference',
        message: 'a guard or feedback cannot use a disabled channel',
      },
    ]);
    // The same reference to the enabled reading is valid.
    delete value.logicalChannels[2].enabled;
    expect(validateSnapshot(value)).toEqual([]);
  });

  it('still rejects unknown channel fields', () => {
    expect(validateSnapshot(withChannel(2, { disabled: true }))).toContainEqual(
      expect.objectContaining({ path: 'logicalChannels[2].disabled', code: 'unknown_field' }),
    );
  });

  it('keeps the content hash of a stored snapshot without the flag unchanged', () => {
    // Recorded before `enabled` existed; stored revisions must keep their hashes.
    const stored: WagoConfigurationSnapshot = {
      version: 1,
      physicalPoints: [{ id: 'point-a', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'a',
          physicalPointId: 'point-a',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'immediate' },
        },
      ],
    };
    expect(validateSnapshot(stored)).toEqual([]);
    expect(configurationHash(stored)).toBe(STORED_SNAPSHOT_HASH);
  });
});
