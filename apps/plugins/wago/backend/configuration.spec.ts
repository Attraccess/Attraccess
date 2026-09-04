import {
  canonicalSnapshot,
  configurationDiff,
  configurationHash,
  applyPreset,
  parseConfigurationReport,
  validateSnapshot,
} from './configuration';

describe('WAGO configuration snapshots', () => {
  it('hashes equivalent snapshots identically regardless of object key order', () => {
    expect(configurationHash({ version: 1, physicalPoints: [], logicalChannels: [] })).toBe(
      configurationHash({ logicalChannels: [], physicalPoints: [], version: 1 }),
    );
    expect(canonicalSnapshot({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('returns field-level changes between configuration snapshots', () => {
    expect(
      configurationDiff(
        { version: 1, physicalPoints: [], logicalChannels: [] },
        { version: 1, physicalPoints: [], logicalChannels: [{ id: 'output-a' }] },
      ),
    ).toEqual([{ path: '$.logicalChannels[0]', previous: undefined, current: { id: 'output-a' } }]);
  });

  it('accepts only structured controller rejection errors', () => {
    expect(
      parseConfigurationReport({
        revision: 3,
        contentHash: 'a'.repeat(64),
        errors: [{ path: 'logicalChannels[0].profile', code: 'unsupported_value', message: 'unsupported profile' }],
      }),
    ).toEqual(expect.objectContaining({ revision: 3 }));
    expect(
      parseConfigurationReport({ revision: 3, contentHash: 'a'.repeat(64), errors: [{ code: 'invalid' }] }),
    ).toBeNull();
  });

  it('reports every broken reference instead of accepting a partial snapshot', () => {
    expect(
      validateSnapshot({
        version: 1,
        physicalPoints: [],
        logicalChannels: [
          {
            id: 'channel-a',
            physicalPointId: 'missing-point',
            profile: 'generic-digital-output',
            capabilities: ['output'],
            disconnectPolicy: { mode: 'hold' },
          },
        ],
      }),
    ).toEqual([expect.objectContaining({ path: 'logicalChannels[0].physicalPointId', code: 'missing_reference' })]);
  });

  it('rejects empty, unknown, and opaque configuration fields', () => {
    expect(
      validateSnapshot({
        version: 1,
        physicalPoints: [],
        logicalChannels: [],
        policy: {},
      }),
    ).toEqual([expect.objectContaining({ path: 'policy', code: 'unknown_field' })]);
  });

  it('requires a complete versioned channel contract', () => {
    expect(validateSnapshot({})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'version', code: 'required_field' }),
        expect.objectContaining({ path: 'physicalPoints', code: 'required_field' }),
        expect.objectContaining({ path: 'logicalChannels', code: 'required_field' }),
      ]),
    );
  });

  it('builds editable presets with explicit disconnect defaults', () => {
    const base = {
      version: 1 as const,
      physicalPoints: [{ id: 'point-a', hardwareProfile: '751-9301' as const, channel: 0 }],
      logicalChannels: [],
    };
    const output = applyPreset(base, { presetId: 'pulsed-lock-bank', channelId: 'lock-a', physicalPointId: 'point-a' });
    const input = applyPreset(base, {
      presetId: 'generic-monitored-input',
      channelId: 'input-a',
      physicalPointId: 'point-a',
    });

    expect(output.logicalChannels[0]).toMatchObject({
      capabilities: ['output', 'pulse'],
      disconnectPolicy: { mode: 'immediate' },
      pulse: { durationMs: 500 },
    });
    expect(input.logicalChannels[0]).toMatchObject({ capabilities: ['input'], disconnectPolicy: { mode: 'hold' } });
  });

  it('validates feedback mismatch declarations as declarative configuration', () => {
    expect(
      validateSnapshot({
        version: 1,
        physicalPoints: [
          { id: 'output', hardwareProfile: '751-9301', channel: 0 },
          { id: 'input', hardwareProfile: '751-9301', channel: 1 },
        ],
        logicalChannels: [
          {
            id: 'feedback',
            physicalPointId: 'input',
            profile: 'generic-monitored-input',
            capabilities: ['input'],
            disconnectPolicy: { mode: 'hold' },
          },
          {
            id: 'output',
            physicalPointId: 'output',
            profile: 'generic-digital-output',
            capabilities: ['output', 'feedback'],
            disconnectPolicy: { mode: 'immediate' },
            feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 100 },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('requires feedback to reference a distinct input channel', () => {
    const snapshot = {
      version: 1,
      physicalPoints: [{ id: 'output', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'output',
          physicalPointId: 'output',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'output', expected: 'match', timeoutMs: 100 },
        },
      ],
    };

    expect(validateSnapshot(snapshot)).toContainEqual(
      expect.objectContaining({ path: 'logicalChannels[0].feedback.channelId', code: 'invalid_feedback_channel' }),
    );
  });
});
