import { SimulatorDeviceAdapter } from './simulator-device';

const output = { id: 'output', hardwareProfile: '751-9301' as const, channel: 0 };
const meter = { id: 'meter', hardwareProfile: '879-3000' as const, channel: 0 };

describe('SimulatorDeviceAdapter', () => {
  it('uses configured input values and advances deterministic measurements', async () => {
    const device = new SimulatorDeviceAdapter({ '751-9301:0': true, '879-3000:0': 10 }, 'normal', 2);

    await expect(device.read(output)).resolves.toBe(true);
    await expect(device.read(meter)).resolves.toBe(12);
    await expect(device.read(meter)).resolves.toBe(14);
  });

  it('returns inverse feedback and fails writes for the matching scenarios', async () => {
    const mismatch = new SimulatorDeviceAdapter({}, 'feedback-mismatch', 0);
    await mismatch.write(output, true);
    await expect(mismatch.read(output)).resolves.toBe(false);

    const failing = new SimulatorDeviceAdapter({}, 'write-failure', 0);
    await expect(failing.write(output, true)).rejects.toThrow('simulated output write failure');
  });

  it('restores persisted output values to their physical points', async () => {
    const device = new SimulatorDeviceAdapter({}, 'normal', 0);
    device.restore({
      version: 1,
      physicalPoints: [output],
      logicalChannels: [{
        id: 'load',
        physicalPointId: 'output',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'hold' },
      }],
    }, { load: true });

    await expect(device.read(output)).resolves.toBe(true);
  });
});
