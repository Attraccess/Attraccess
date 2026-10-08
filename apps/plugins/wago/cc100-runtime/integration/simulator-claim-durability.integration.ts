import { once } from 'node:events';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WagoController } from '../../backend/controllers/entity';

import { discoveryTopic } from '../../backend/protocol/index';

import { temporary } from './simulator-fixtures.test-utils';

import { hardwareId } from './simulator-fixtures.test-utils';
import { prefix } from './simulator-fixtures.test-utils';
import { base } from './simulator-fixtures.test-utils';

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
  it.each([false, true])(
    'captures actual main claim and acknowledges only after durable state (failed save: %s)',
    async (failSave) => {
      fixture.disconnectOnRevoke = true;
      fixture.service.onModuleDestroy();
      const { WagoService: MainService } = require(process.env.WAGO_INTEGRATION_MAIN_SOURCE!);
      fixture.service = new MainService(fixture.context);
      await fixture.service.onApplicationBootstrap();
      const enrollment = await fixture.service.createEnrollment(hardwareId, 1);
      await fixture.expectRejectedIdentity(enrollment.username, enrollment.password, 'wrong-client-id');
      const statePath = join(temporary, `main-claim-state-${failSave}.json`);
      if (failSave) {
        fixture.launch(statePath, { WAGO_HARDWARE_ID: hardwareId });
        const [exitCode] = await once(fixture.child!, 'exit');
        expect(exitCode).toBe(1);
        expect(fixture.errors.join('')).toContain('WAGO_PAIRING_CODE is required');
        fixture.errors = [];
        // Recover even from a blank value persisted by an older simulator.
        await writeFile(
          statePath,
          JSON.stringify({ simulatorHardwareId: hardwareId, simulatorPairingCode: '', outputs: {}, commandIds: [] }),
        );
      }
      const ordering: string[] = [];
      let durableAtAck: Record<string, any> | undefined;
      fixture.onPublishReceived = (source, packet) => {
        if (source?.identity === enrollment.username && packet.topic === `${discoveryTopic(hardwareId)}/claim/ack`) {
          durableAtAck = JSON.parse(readFileSync(statePath, 'utf8'));
          ordering.push('ack');
        }
      };
      fixture.broker.on('clientDisconnect', (source) => {
        if (source.identity === enrollment.username) ordering.push('enrollment-end');
      });
      fixture.launch(statePath, {
        WAGO_HARDWARE_ID: hardwareId,
        WAGO_PAIRING_CODE: '482931',
        WAGO_ENROLLMENT_SECRET: enrollment.claimSecret,
        WAGO_ENROLLMENT_USERNAME: enrollment.username,
        WAGO_ENROLLMENT_PASSWORD: enrollment.password,
      });
      const controllers = fixture.repositories.get(WagoController)!;
      await eventually(() => expect(controllers.rows).toHaveLength(1), 'main discovers simulator');
      if (failSave) await mkdir(`${statePath}.next`);
      await fixture.service.claim(controllers.rows[0].id, 'Main claim simulator', '482931');
      const claim = JSON.parse(
        fixture.messages.find((message) => message.topic === `${discoveryTopic(hardwareId)}/claim`)!.payload.toString(),
      );
      expect(claim).toMatchObject({
        username: `wago-controller-${hardwareId}`,
        password: expect.any(String),
        acknowledgementToken: expect.any(String),
        configuration: {
          protocolVersion: 1,
          namespace: prefix,
          desiredTopic: `${base}/configuration/desired`,
          reportedTopic: `${base}/configuration/reported`,
        },
      });
      if (failSave) {
        await eventually(
          () => expect(fixture.errors.some((error) => error.includes('EISDIR'))).toBe(true),
          'credential persistence fails',
        );
        expect(ordering).toEqual([]);
        expect(fixture.connections).not.toContain(claim.username);
        expect(JSON.parse(await readFile(statePath, 'utf8')).credentials).toBeUndefined();
        expect(fixture.identities.has(enrollment.username)).toBe(true);
        await rm(`${statePath}.next`, { recursive: true });
        fixture.errors = [];
        await fixture.mqtt.publishAsync(`${discoveryTopic(hardwareId)}/claim`, JSON.stringify(claim), { qos: 1 });
      }
      await eventually(() => expect(ordering).toEqual(['ack', 'enrollment-end']), 'ack before enrollment termination');
      expect(durableAtAck).toMatchObject({
        simulatorPairingCode: '482931',
        credentials: { username: claim.username, password: claim.password },
        operationalPrefix: prefix,
        simulatorHardwareId: hardwareId,
      });
      const ack = fixture.messages.find((message) => message.topic === `${discoveryTopic(hardwareId)}/claim/ack`)!;
      expect(ack.username).toBe(enrollment.username);
      expect(JSON.parse(ack.payload.toString())).toEqual({ acknowledgementToken: claim.acknowledgementToken });
      await eventually(
        () => expect(fixture.identities.has(enrollment.username)).toBe(false),
        'main revokes acknowledged enrollment',
      );
      await eventually(() => expect(fixture.connections).toContain(claim.username), 'permanent identity connects');
      await fixture.expectRejectedIdentity(claim.username, claim.password, 'wrong-permanent-client-id');
      expect(fixture.errors).toEqual([]);
    },
  );
});
