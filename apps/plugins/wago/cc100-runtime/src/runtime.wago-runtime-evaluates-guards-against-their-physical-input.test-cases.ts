import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeEvaluatesGuardsAgainstTheirPhysicalInput(scope: WagoRuntimeTestScope): void {
  it('evaluates guards against their physical input', async () => {
    const guarded: Snapshot = {
      ...scope.snapshot,
      physicalPoints: [...scope.snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'interlock',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...scope.snapshot.logicalChannels[0],
          capabilities: ['output', 'guard'],
          guard: { channelId: 'interlock', when: 'on' },
        },
      ],
    };
    scope.device.values.set('751-9301:1', true);
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(guarded),
      snapshot: guarded,
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    expect(scope.device.values.get('751-9301:0')).toBe(true);
  });
}
