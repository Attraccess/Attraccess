import { readFile } from 'node:fs/promises';

import { join } from 'node:path';

import { WagoController } from '../../backend/controllers/entity';

import { WagoConfigurationRevision } from '../../backend/configuration/revision.entity';
import { parseAnnouncement, parseHeartbeat, discoveryTopic } from '../../backend/protocol/index';
import { hash } from '../src/runtime';
import { temporary } from './simulator-fixtures.test-utils';

import { hardwareId } from './simulator-fixtures.test-utils';

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
  it('discovers, verifies physical code, claims, applies configuration, reconnects and restarts with permanent identity', async () => {
    await fixture.expectRejectedIdentity('unknown-identity');
    const enrollment = await fixture.service.createEnrollment(hardwareId, 1);
    const statePath = join(temporary, 'lifecycle-state.json');
    fixture.launch(statePath, {
      WAGO_HARDWARE_ID: hardwareId,
      WAGO_PAIRING_CODE: '482931',
      WAGO_ENROLLMENT_SECRET: enrollment.claimSecret,
      WAGO_ENROLLMENT_USERNAME: enrollment.username,
      WAGO_ENROLLMENT_PASSWORD: enrollment.password!,
    });
    const controllers = fixture.repositories.get(WagoController)!;
    await eventually(() => expect(controllers.rows).toHaveLength(1), 'discovery');
    const announcement = fixture.messages.find((item) => item.topic === discoveryTopic(hardwareId))!;
    expect(parseAnnouncement(announcement.payload).hardwareId).toBe(hardwareId);
    expect(announcement.username).toBe(enrollment.username);
    const discoveries = fixture.messages.filter((item) => item.topic === discoveryTopic(hardwareId)).length;
    Object.values(fixture.broker.clients).forEach((client: any) => {
      if (client.identity === enrollment.username) client.conn.destroy();
    });
    await eventually(
      () =>
        expect(fixture.messages.filter((item) => item.topic === discoveryTopic(hardwareId)).length).toBeGreaterThan(
          discoveries,
        ),
      'enrollment reconnect republishes fixed-root discovery',
    );
    const controller = controllers.rows[0];
    await expect(fixture.service.claim(controller.id, 'Isolated simulator', 'wrong-code')).rejects.toThrow(
      'physical pairing',
    );
    await fixture.service.claim(controller.id, 'Isolated simulator', '482931');
    await eventually(() => expect(controller.lastHeartbeatAt).toBeTruthy(), 'backend accepted permanent heartbeat');
    const heartbeat = fixture.messages.find((item) => item.topic === `${base}/heartbeat`)!;
    expect(parseHeartbeat(heartbeat.payload).hardwareId).toBe(hardwareId);
    expect(heartbeat.username).toBe(`wago-controller-${hardwareId}`);
    const revision = {
      id: 1,
      controllerId: controller.id,
      revision: 1,
      state: 'published',
      contentHash: hash(snapshot),
      snapshot: JSON.stringify(snapshot),
    };
    fixture.repositories.get(WagoConfigurationRevision)!.rows.push(revision);
    await fixture.mqtt.publishAsync(
      `${base}/configuration/desired`,
      JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: revision.contentHash, snapshot }),
      { qos: 1, retain: true },
    );
    await eventually(() => expect(revision.state).toBe('applied'), 'backend applied configuration');
    await fixture.mqtt.publishAsync(`${base}/commands`, JSON.stringify(outputCommand('output-1')), { qos: 1 });
    await eventually(
      () =>
        expect(
          fixture.messages.some(
            (item) =>
              item.topic === `${base}/acknowledgements` && JSON.parse(item.payload.toString()).status === 'accepted',
          ),
        ).toBe(true),
      'command acknowledgement',
    );
    await eventually(
      () =>
        expect(
          fixture.messages.some(
            (item) => item.topic === `${base}/state` && JSON.parse(item.payload.toString()).outputs.load === true,
          ),
        ).toBe(true),
      'physical output feedback',
    );
    const beforeReconnect = fixture.connections.filter((name) => name === `wago-controller-${hardwareId}`).length;
    const lastHeartbeat = (await fixture.service.list()).find((item) => item.id === controller.id)!.lastHeartbeatAt;
    Object.values(fixture.broker.clients).forEach((client: any) => {
      if (client.identity === `wago-controller-${hardwareId}`) client.conn.destroy();
    });
    await eventually(
      () =>
        expect(fixture.connections.filter((name) => name === `wago-controller-${hardwareId}`).length).toBeGreaterThan(
          beforeReconnect,
        ),
      'TCP reconnect',
    );
    await eventually(async () => {
      const current = (await fixture.service.list()).find((item) => item.id === controller.id)!;
      expect(current.lastHeartbeatAt).not.toBe(lastHeartbeat);
      expect(current.connectivity).toBe('online');
    }, 'heartbeat after reconnect');
    await fixture.mqtt.publishAsync(`${base}/commands`, JSON.stringify(outputCommand('after-reconnect')), { qos: 1 });
    await eventually(
      () =>
        expect(
          fixture.messages.filter(
            (item) =>
              item.topic === `${base}/acknowledgements` && JSON.parse(item.payload.toString()).id === 'after-reconnect',
          ),
        ).toHaveLength(1),
      'command subscription restored without duplicate listeners',
    );
    await fixture.stop();
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    expect(persisted).toMatchObject({
      simulatorHardwareId: hardwareId,
      accepted: { revision: 1 },
      outputs: { load: true },
    });
    const start = fixture.messages.length;
    fixture.launch(statePath); // no hardware ID, pairing code or enrollment credentials
    await eventually(
      () =>
        expect(
          fixture.messages
            .slice(start)
            .some((item) => item.topic === `${base}/heartbeat` && item.username === `wago-controller-${hardwareId}`),
        ).toBe(true),
      'permanent restart',
    );
    await eventually(
      () =>
        expect(
          fixture.messages
            .slice(start)
            .some(
              (item) => item.topic === `${base}/state` && JSON.parse(item.payload.toString()).outputs.load === true,
            ),
        ).toBe(true),
      'restored output',
    );
    expect(fixture.messages.slice(start).some((item) => item.topic === discoveryTopic(hardwareId))).toBe(false);
    expect(fixture.errors).toEqual([]);
  });
});
