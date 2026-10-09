import { readFile, writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { hash } from '../src/runtime';
import { temporary } from './simulator-fixtures.test-utils';

import { hardwareId } from './simulator-fixtures.test-utils';
import { prefix } from './simulator-fixtures.test-utils';
import { base } from './simulator-fixtures.test-utils';

import { snapshot } from './simulator-fixtures.test-utils';
import { eventually } from './simulator-fixtures.test-utils';

import { SimulatorFixture } from './simulator-harness.test-utils';
describe('isolated broker / executable simulator', () => {
  let fixture: SimulatorFixture;
  beforeEach(async () => {
    fixture = new SimulatorFixture();
    await fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  it.each(['stale-heartbeat', 'offline', 'reject-configuration'])(
    'executes the %s scenario over MQTT',
    async (scenario) => {
      const statePath = join(temporary, `${scenario}.json`);
      const username = `wago-controller-${hardwareId}`;
      fixture.identities.set(username, {
        password: 'permanent',
        publish: [`${base}/#`],
        subscribe: [`${base}/commands`, `${base}/configuration/desired`],
      });
      await writeFile(
        statePath,
        JSON.stringify({
          simulatorHardwareId: hardwareId,
          credentials: { username, password: 'permanent' },
          operationalPrefix: prefix,
          outputs: {},
          commandIds: [],
        }),
      );
      fixture.launch(statePath, { WAGO_SCENARIO: scenario });
      await eventually(
        () => expect(fixture.messages.some((item) => item.topic === `${base}/heartbeat`)).toBe(true),
        'initial heartbeat',
      );
      if (scenario === 'reject-configuration') {
        await fixture.mqtt.publishAsync(
          `${base}/configuration/desired`,
          JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot }),
          { qos: 1 },
        );
        await eventually(
          () =>
            expect(
              fixture.messages.some(
                (item) =>
                  item.topic === `${base}/configuration/reported` &&
                  JSON.parse(item.payload.toString()).errors[0]?.code === 'simulated_rejection',
              ),
            ).toBe(true),
          'rejected configuration',
        );
        expect(JSON.parse(await readFile(statePath, 'utf8')).accepted).toBeUndefined();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(fixture.messages.filter((item) => item.topic === `${base}/heartbeat`)).toHaveLength(1);
        expect(fixture.messages.filter((item) => item.topic === `${base}/measurements`)).toHaveLength(0);
        const connected = Object.values(fixture.broker.clients).some((client: any) => client.identity === username);
        expect(connected).toBe(scenario === 'stale-heartbeat');
      }
      expect(fixture.errors).toEqual([]);
    },
  );
});
