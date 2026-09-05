import { configurationDiff, type WagoConfigurationSnapshot } from './configuration';
import { changeLabel, readableStructuralChanges } from '../frontend/src/configuration-model';

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
