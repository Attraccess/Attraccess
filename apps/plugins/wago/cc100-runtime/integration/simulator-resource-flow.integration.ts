import { writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { WagoController } from '../../backend/controllers/entity';

import { WagoConfigurationRevision } from '../../backend/configuration/revision.entity';

import { hash } from '../src/runtime';
import { temporary } from './simulator-fixtures.test-utils';

import { hardwareId } from './simulator-fixtures.test-utils';
import { prefix } from './simulator-fixtures.test-utils';
import { base } from './simulator-fixtures.test-utils';
import { outputCommand } from './simulator-fixtures.test-utils';
import { snapshot } from './simulator-fixtures.test-utils';
import { eventually } from './simulator-fixtures.test-utils';

import { dirnameOf } from './simulator-fixtures.test-utils';
import { SimulatorFixture } from './simulator-harness.test-utils';
const flowTest = process.env.WAGO_INTEGRATION_LIFECYCLE_ONLY === '1' ? it.skip : it;
describe('isolated broker / executable simulator', () => {
  let fixture: SimulatorFixture;
  beforeEach(async () => {
    fixture = new SimulatorFixture();
    await fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  flowTest(
    'routes an unmodified runtime measurement through the actual parser and flow service to an output',
    async () => {
      const source = process.env.WAGO_INTEGRATION_FLOW_SOURCE!;
      // This intentionally fails when ATT-978 is absent or the producer contract
      // is incompatible. Never synthesize timestamp/sequence/measurement fields.
      const { WagoFlowService } = require(source);
      const { parseOperationalMessage } = require(join(dirnameOf(source), 'protocol.ts'));
      const statePath = join(temporary, 'flow.json');
      const username = `wago-controller-${hardwareId}`;
      fixture.identities.set(username, {
        password: 'permanent',
        publish: [`${base}/#`],
        subscribe: [`${base}/commands`, `${base}/configuration/desired`],
      });
      fixture.repositories.get(WagoController)!.rows.push({
        id: 1,
        hardwareId,
        trustState: 'claimed',
        mqttServerId: 1,
        lastHeartbeatAt: new Date().toISOString(),
        compatibilityError: null,
      });
      fixture.repositories.get(WagoConfigurationRevision)!.rows.push({
        id: 1,
        controllerId: 1,
        revision: 1,
        state: 'applied',
        snapshot: JSON.stringify(snapshot),
        contentHash: hash(snapshot),
      });
      await writeFile(
        statePath,
        JSON.stringify({
          simulatorHardwareId: hardwareId,
          credentials: { username, password: 'permanent' },
          operationalPrefix: prefix,
          accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
          outputs: {},
          commandIds: [],
        }),
      );
      const triggers: unknown[] = [];
      Object.assign(fixture.context, {
        flows: {
          trigger: async (type: string, predicate: (config: object, nodeId: string) => boolean, payload: unknown) => {
            const config = { controllerId: 1, channelId: 'level', category: 'measurement' };
            if (!predicate(config, 'integration-measurement-node')) return;
            triggers.push({ type, payload });
            await fixture.mqtt.publishAsync(
              `${base}/commands`,
              JSON.stringify(outputCommand(`flow-${triggers.length}`)),
              {
                qos: 1,
              },
            );
          },
        },
      });
      const flow = new WagoFlowService(fixture.context);
      try {
        await flow.onModuleInit();
        fixture.launch(statePath);
        await eventually(
          () => expect(fixture.messages.some((item) => item.topic === `${base}/measurements`)).toBe(true),
          'existing runtime measurement producer',
        );
        const measurement = fixture.messages.find((item) => item.topic === `${base}/measurements`)!;
        const firstMeasurement = JSON.parse(measurement.payload.toString());
        expect(firstMeasurement.timestamp).toBe(new Date(firstMeasurement.timestamp).toISOString());
        expect(firstMeasurement.streamId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(firstMeasurement.sequence).toBe(1);
        expect(parseOperationalMessage(prefix, measurement.topic, measurement.payload)).toMatchObject({
          hardwareId,
          message: { category: 'measurement', channelId: 'level', value: 42000, unit: 'millipercent', kind: 'live' },
        });
        await eventually(() => expect(triggers.length).toBeGreaterThan(0), 'actual WagoFlowService trigger');
        await eventually(
          () =>
            expect(
              fixture.messages.some(
                (item) =>
                  item.topic === `${base}/acknowledgements` &&
                  JSON.parse(item.payload.toString()).id.startsWith('flow-') &&
                  JSON.parse(item.payload.toString()).status === 'accepted',
              ),
            ).toBe(true),
          'flow command acknowledged',
        );
        await eventually(
          () =>
            expect(
              fixture.messages.some(
                (item) => item.topic === `${base}/state` && JSON.parse(item.payload.toString()).outputs.load === true,
              ),
            ).toBe(true),
          'flow reported output',
        );
        await expect(fixture.readDeviceChannel('load')).resolves.toBe(true);
        const firstState = JSON.parse(
          fixture.messages.find((item) => item.topic === `${base}/state`)!.payload.toString(),
        );
        const firstAck = JSON.parse(
          fixture.messages.find((item) => item.topic === `${base}/acknowledgements`)!.payload.toString(),
        );
        for (const event of [firstState, firstAck]) {
          expect(event.streamId).toBe(firstMeasurement.streamId);
          expect(event.sequence).toBe(1); // counters are independent across categories
          expect(event.timestamp).toBe(new Date(event.timestamp).toISOString());
        }
        await fixture.stop();
        const beforeRestart = fixture.messages.length;
        const previousTriggers = triggers.length;
        fixture.launch(statePath);
        await eventually(
          () =>
            expect(fixture.messages.slice(beforeRestart).some((item) => item.topic === `${base}/measurements`)).toBe(
              true,
            ),
          'measurement after process restart',
        );
        const restarted = JSON.parse(
          fixture.messages
            .slice(beforeRestart)
            .find((item) => item.topic === `${base}/measurements`)!
            .payload.toString(),
        );
        expect(restarted.streamId).not.toBe(firstMeasurement.streamId);
        expect(restarted.sequence).toBe(1);
        expect(restarted).toMatchObject({ kind: 'live', unit: 'millipercent', value: 42000 });
        await eventually(
          () => expect(triggers.length).toBeGreaterThan(previousTriggers),
          'same actual flow consumer accepts new boot',
        );
        const cached = flow.read({ controllerId: 1, channelId: 'level', category: 'measurement' });
        expect(cached).toMatchObject({
          streamId: restarted.streamId,
          value: 42000,
          unit: 'millipercent',
          kind: 'live',
        });
        expect(flow.payload(cached)).toMatchObject({ available: true, stale: false });
        await fixture.stop();
        // Advance only the consumer clock; never rewrite the captured producer
        // timestamp. An offline producer cannot keep an old matching value usable.
        const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_001);
        try {
          expect(flow.payload(cached)).toMatchObject({ available: false, stale: true });
          await expect(
            flow.wait({ controllerId: 1, channelId: 'level', category: 'measurement', equals: 42000, timeoutMs: 20 }),
          ).resolves.toBeNull();
        } finally {
          clock.mockRestore();
        }
        expect(fixture.errors).toEqual([]);
      } finally {
        flow.onModuleDestroy();
      }
    },
  );
});
