import { writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { hash } from '../src/runtime';
import { temporary } from './simulator-fixtures.test-utils';

import { hardwareId } from './simulator-fixtures.test-utils';
import { prefix } from './simulator-fixtures.test-utils';
import { base } from './simulator-fixtures.test-utils';
import { outputCommand } from './simulator-fixtures.test-utils';
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
  it('enforces current main command expiry and configuration revision on the real broker', async () => {
    const username = `wago-controller-${hardwareId}`;
    fixture.identities.set(username, {
      password: 'permanent',
      publish: [`${base}/#`],
      subscribe: [`${base}/commands`, `${base}/configuration/desired`],
    });
    const statePath = join(temporary, 'main-commands.json');
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
    fixture.launch(statePath, {}, 'main-simulator.cjs');
    await eventually(
      () => expect(fixture.messages.some((item) => item.topic === `${base}/heartbeat`)).toBe(true),
      'main runtime ready',
    );
    for (const command of [
      { ...outputCommand('missing-revision'), expectedConfigurationRevision: undefined },
      { ...outputCommand('missing-expiry'), expiresAt: undefined },
      { ...outputCommand('expired'), expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ...outputCommand('wrong-revision'), expectedConfigurationRevision: 2 },
    ]) {
      await fixture.mqtt.publishAsync(`${base}/commands`, JSON.stringify(command), { qos: 1 });
      await eventually(
        () =>
          expect(
            fixture.messages.some(
              (item) =>
                item.topic === `${base}/acknowledgements` &&
                JSON.parse(item.payload.toString()).id === command.id &&
                JSON.parse(item.payload.toString()).status === 'rejected',
            ),
          ).toBe(true),
        `main rejected ${command.id}`,
      );
    }
    await expect(fixture.readDeviceChannel('load')).resolves.toBe(false);
    await fixture.mqtt.publishAsync(`${base}/commands`, JSON.stringify(outputCommand('main-valid')), { qos: 1 });
    await eventually(
      () =>
        expect(
          fixture.messages.some(
            (item) =>
              item.topic === `${base}/acknowledgements` &&
              JSON.parse(item.payload.toString()).id === 'main-valid' &&
              JSON.parse(item.payload.toString()).status === 'accepted',
          ),
        ).toBe(true),
      'main accepts correctly scoped unexpired command',
    );
    await expect(fixture.readDeviceChannel('load')).resolves.toBe(true);
    expect(fixture.errors).toEqual([]);
  });
});
