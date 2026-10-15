import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AssuranceFixture, delay, eventually } from './fixture';
import { MESSAGE_LIMITS } from '../../shared/protocol-limits';
import { hash } from '../../cc100-runtime/src/runtime';

jest.setTimeout(120_000);
describe('malformed, duplicate, expired and out-of-order traffic', () => {
  const fixture = new AssuranceFixture();
  beforeAll(async () => fixture.start(2));
  afterAll(async () => fixture.close());
  it('keeps accepted configuration and unrelated outputs intact without replaying expired commands', async () => {
    const device = fixture.devices[0];
    const root = `${fixture.prefix}/v1/controllers/${device.hardwareId}`;
    const before = await device.store.load();
    const id = randomUUID();
    const publish = (topic: string, payload: unknown) =>
      fixture.backendClient.publishAsync(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), {
        qos: 1,
      });
    const command = {
      id,
      channelId: 'out',
      action: 'set',
      value: false,
      expectedConfigurationRevision: 1,
      expiresAt: new Date(Date.now() + 5000).toISOString(),
    };
    const acknowledgements: Array<{ id: string; status: string; error?: string }> = [];
    const receive = (topic: string, payload: Buffer) => {
      if (topic === `${root}/acknowledgements`) acknowledgements.push(JSON.parse(payload.toString()));
    };
    fixture.backendClient.on('message', receive);
    try {
      await publish(`${root}/commands`, command);
      await eventually(() => acknowledgements.some((ack) => ack.id === id && ack.status === 'accepted'));
      await publish(`${root}/commands`, command);
      await eventually(() => acknowledgements.some((ack) => ack.id === id && ack.status === 'duplicate'));
      const expired = {
        ...command,
        id: randomUUID(),
        value: true,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      await publish(`${root}/commands`, expired);
      await eventually(() => acknowledgements.some((ack) => ack.id === expired.id && ack.status === 'rejected'));
      for (const value of [
        '{broken',
        'null',
        JSON.stringify({ ...command, id: '#', value: true }),
        'x'.repeat(MESSAGE_LIMITS.controlBytes + 1),
      ])
        await publish(`${root}/commands`, value);
      await publish(`${root}/configuration/desired`, {
        protocolVersion: 1,
        revision: 2,
        contentHash: 'wrong',
        snapshot: before.accepted?.snapshot,
      });
      await publish(`${root}/configuration/desired`, {
        protocolVersion: 1,
        revision: 0,
        contentHash: hash(before.accepted?.snapshot),
        snapshot: before.accepted?.snapshot,
      });
      await publish(`${root}/configuration/desired`, 'null');
      await delay(200);
      expect((await device.store.load()).accepted).toEqual(before.accepted);
      expect((await device.store.load()).outputs).toMatchObject({ out: false, other: true });
      // Canonical duplicate and older sequence messages must not replace current state.
      const packet = {
        timestamp: new Date().toISOString(),
        streamId: randomUUID(),
        sequence: 10,
        connected: true,
        revision: 1,
        contentHash: hash(before.accepted?.snapshot),
        outputs: { out: false, other: true },
      };
      expect(fixture.backend.diagnostics.ingest(device.id, 'state', Buffer.from(JSON.stringify(packet)))).toBe(true);
      expect(
        fixture.backend.diagnostics.ingest(
          device.id,
          'state',
          Buffer.from(JSON.stringify({ ...packet, sequence: 9, outputs: { out: true } })),
        ),
      ).toBe(false);
      expect(fixture.backend.diagnostics.ingest(device.id, 'state', Buffer.from(JSON.stringify(packet)))).toBe(false);
      expect(fixture.backend.diagnostics.read(device.id).outputs.out.value).toBe(false);
      expect(fixture.errors).toEqual([]);
      await device.client.endAsync(true);
      await fixture.startDevice(device);
      await fixture.fresh();
      await publish(`${root}/commands`, expired);
      await delay(100);
      expect((await device.store.load()).outputs.out).toBe(false);
      if (process.env.WAGO_ASSURANCE_OUTPUT)
        await writeFile(
          join(process.env.WAGO_ASSURANCE_OUTPUT, 'traffic.json'),
          JSON.stringify(
            {
              outcome: 'passed',
              assertions: [
                'duplicate command acknowledged once and then marked duplicate',
                'expired command rejected before and after restart',
                'malformed and excessive messages do not replace configuration',
                'hash mismatch and stale revision rejected',
                'out-of-order canonical traffic cannot replace current state',
                'unrelated output retained',
              ],
            },
            null,
            2,
          ),
        );
    } finally {
      fixture.backendClient.off('message', receive);
    }
  });
});
