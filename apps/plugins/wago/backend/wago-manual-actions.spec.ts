import { createHash } from 'node:crypto';
import { createMock } from '@golevelup/ts-jest';
import type { PluginContext, PluginMqttMessage, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';

const principal = { userId: 42, authenticationMethod: 'api-token' as const, apiTokenId: 17 };
const privateValue = 'private-fixture-password';
function fixture(claimed = true) {
  const controller = Object.assign(new WagoController(), {
    id: 7,
    hardwareId: 'fixture',
    trustState: claimed ? 'claimed' : 'untrusted',
    mqttServerId: 2,
    enrollmentId: 3,
    pairingCodeHash: createHash('sha256').update('pair').digest('hex'),
    compatibilityError: null,
    protocolVersion: '1.0.0',
    capabilities: '["configuration-v1","claim-expiry-v1"]',
  });
  const enrollment = Object.assign(new WagoEnrollment(), {
    id: 3,
    identity: 'enrollment-fixture',
    mqttServerId: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const revision = Object.assign(new WagoConfigurationRevision(), {
    revision: 1,
    state: 'applied',
    snapshot: JSON.stringify({ logicalChannels: [{ id: 'output', capabilities: ['output', 'pulse'] }] }),
  });
  const record = jest.fn().mockResolvedValue({ status: 'recorded' });
  const publish = jest.fn().mockResolvedValue(undefined);
  const provider = {
    availableProviders: jest.fn().mockResolvedValue([]),
    provision: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const callbacks = new Map<string, (message: PluginMqttMessage) => void | Promise<void>>();
  const context = createMock<PluginContext>({
    audit: { record },
    getMqttCredentialProvisioning: () => ({ ...provider, rotate: jest.fn() }),
    getMqttServerConfig: jest.fn().mockResolvedValue({}),
    mqtt: createMock<PluginContext['mqtt']>({
      publish,
      subscribe: jest.fn(async (_server, topic, callback) => {
        callbacks.set(topic, callback);
        return {
          unsubscribe: () => {
            callbacks.delete(topic);
          },
        };
      }),
    }),
  });
  const service = new WagoService(context);
  service['controllers'] = createMock<Repository<WagoController>>({
    findOneBy: jest.fn().mockResolvedValue(controller),
    save: jest.fn(async (row) => row),
  });
  service['enrollments'] = createMock<Repository<WagoEnrollment>>({
    findOneBy: jest.fn().mockResolvedValue(enrollment),
    save: jest.fn(async (row) => row),
  });
  service['revisions'] = createMock<Repository<WagoConfigurationRevision>>({
    find: jest.fn().mockResolvedValue([revision]),
  });
  jest
    .spyOn(service, 'getSettings')
    .mockResolvedValue({ id: 1, operationalPrefix: 'attraccess/wago', defaultMqttServerId: 2 });
  jest.spyOn(service as never, 'subscribeConfiguredServers').mockResolvedValue(undefined as never);
  const acknowledge = async (topic: string, payload: object) =>
    callbacks.get(topic)?.(createMock<PluginMqttMessage>({ payload: Buffer.from(JSON.stringify(payload)) }));
  return { service, record, publish, provider, acknowledge, controller };
}
const command = {
  channelId: 'output',
  action: 'set',
  value: true,
  expectedConfigurationRevision: 1,
  acknowledgementTimeoutSeconds: 1,
};

describe('real manual administration lifecycle boundaries', () => {
  afterEach(() => jest.useRealTimers());
  it.each(['accepted', 'rejected'])(
    'correlates actual manual command %s with bounded redacted result',
    async (status) => {
      const h = fixture();
      let sent!: { id: string };
      h.publish.mockImplementation(async (_server, _topic, payload) => {
        sent = JSON.parse(payload);
        h.service['onCommandAcknowledgement'](
          7,
          Buffer.from(JSON.stringify({ id: sent.id, status, message: privateValue })),
        );
      });
      const result = await h.service.manualCommand(7, command, principal);
      expect(result).toMatchObject({
        commandId: sent.id,
        result: status === 'accepted' ? 'acknowledged' : 'rejected',
      });
      expect(h.record.mock.calls.map(([event]) => event.outcome)).toEqual([
        'attempted',
        status === 'accepted' ? 'succeeded' : 'failed',
      ]);
      expect(h.record.mock.calls[0][0].operationId).toBe(h.record.mock.calls[1][0].operationId);
      expect(h.record.mock.calls[1][0]).toMatchObject({
        principal,
        details: { commandId: sent.id, channelId: 'output', operation: 'set', result: result.result },
      });
      expect(JSON.stringify(h.record.mock.calls)).not.toContain(privateValue);
      expect(h.record.mock.calls[1][0].details).not.toHaveProperty('value');
      h.service.onModuleDestroy();
    },
  );
  it.each([false, true])(
    'bounds missing acknowledgement or stalled dispatch even after early acknowledgement (%p)',
    async (earlyAck) => {
      jest.useFakeTimers();
      const h = fixture();
      h.publish.mockImplementation((_server, _topic, payload) => {
        if (earlyAck)
          h.service['onCommandAcknowledgement'](
            7,
            Buffer.from(JSON.stringify({ id: JSON.parse(payload).id, status: 'accepted' })),
          );
        return earlyAck ? new Promise(() => undefined) : Promise.resolve();
      });
      const result = h.service.manualCommand(7, command, principal);
      await jest.advanceTimersByTimeAsync(1001);
      await expect(result).resolves.toMatchObject({ result: 'timeout' });
      expect(h.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: 'failed', details: expect.objectContaining({ result: 'timeout' }) }),
      );
      h.service.onModuleDestroy();
    },
  );
  it('does not label automatic flow execution as a manual command', async () => {
    const h = fixture();
    await h.service.executeCommand({ ...command, controllerId: 7, completionBehavior: 'dispatch' });
    expect(h.record).not.toHaveBeenCalled();
    h.service.onModuleDestroy();
  });
  it('completes manual credential fallback only after the actual matching runtime acknowledgement', async () => {
    const h = fixture(false);
    h.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload);
      expect(credentials.password).toBe(privateValue);
      expect(h.record.mock.calls.map(([event]) => event.outcome)).toEqual(['attempted']);
      await h.acknowledge(`${topic}/ack`, { acknowledgementToken: 'wrong' });
      expect(h.record).toHaveBeenCalledTimes(1);
      await h.acknowledge(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
    });
    await expect(
      h.service.completeManualCredentials(
        7,
        { name: 'Fixture', verifier: 'pair', username: 'wago-controller-fixture', password: privateValue },
        principal,
      ),
    ).resolves.toEqual({ controllerId: 7, result: 'acknowledged' });
    expect(h.provider.provision).not.toHaveBeenCalled();
    expect(h.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.manual_credential_fallback', 'attempted'],
      ['wago.manual_credential_fallback', 'succeeded'],
    ]);
    expect(h.controller.trustState).toBe('claimed');
    expect(JSON.stringify(h.record.mock.calls)).not.toContain(privateValue);
    h.service.onModuleDestroy();
  });
  it('preserves acknowledged permanent credentials when the broker publish callback later rejects', async () => {
    const h = fixture(false);
    h.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const message = JSON.parse(payload);
      expect(Date.parse(message.expiresAt)).toBeGreaterThan(Date.now());
      await h.acknowledge(`${topic}/ack`, { acknowledgementToken: message.acknowledgementToken });
      throw new Error('lost broker acknowledgement');
    });
    await expect(
      h.service.completeManualCredentials(
        7,
        { name: 'Fixture', verifier: 'pair', username: 'wago-controller-fixture', password: privateValue },
        principal,
      ),
    ).rejects.toThrow('handoff is uncertain');
    expect(h.controller.trustState).toBe('claimed');
    expect(h.provider.revoke.mock.calls.map(([request]) => request.identity)).toEqual(['enrollment-fixture']);
    expect(h.record.mock.calls.map(([event]) => event.outcome)).toEqual(['attempted', 'failed']);
    h.service.onModuleDestroy();
  });

  it.each([false, true])(
    'bounds stalled fallback dispatch and forbids its late continuation (early ack %p)',
    async (earlyAck) => {
      jest.useFakeTimers();
      const h = fixture(false);
      let finishPublish!: () => void;
      h.publish.mockImplementation(async (_server, topic, payload) => {
        if (!topic.endsWith('/claim')) return;
        if (earlyAck)
          await h.acknowledge(`${topic}/ack`, { acknowledgementToken: JSON.parse(payload).acknowledgementToken });
        await new Promise<void>((resolve) => {
          finishPublish = resolve;
        });
      });
      const result = h.service.completeManualCredentials(
        7,
        { name: 'Fixture', verifier: 'pair', username: 'wago-controller-fixture', password: privateValue },
        principal,
      );
      const rejected = expect(result).rejects.toThrow('acknowledgement timed out');
      await jest.advanceTimersByTimeAsync(30_001);
      await rejected;
      expect(h.record.mock.calls.map(([event]) => event.outcome)).toEqual(['attempted', 'failed']);
      expect(h.controller).toMatchObject({ trustState: 'claimed', credentialMqttServerId: 2 });
      const revocations = h.provider.revoke.mock.calls.length;
      finishPublish();
      await jest.advanceTimersByTimeAsync(1);
      expect(h.publish).toHaveBeenCalledTimes(1);
      expect(h.provider.revoke).toHaveBeenCalledTimes(revocations);
      h.service.onModuleDestroy();
    },
  );
  it('ignores a late acknowledgement after timeout and ownership loss', async () => {
    jest.useFakeTimers();
    const h = fixture(false);
    let owned = true;
    let token = '';
    h.publish.mockImplementation(async (_server, topic, payload) => {
      if (topic.endsWith('/claim')) token = JSON.parse(payload).acknowledgementToken;
    });
    const result = h.service.completeManualCredentials(
      7,
      { name: 'Fixture', verifier: 'pair', username: 'wago-controller-fixture', password: privateValue },
      principal,
      async () => {
        if (!owned) throw new Error('lease_lost');
      },
    );
    const rejected = expect(result).rejects.toThrow('acknowledgement timed out');
    await jest.advanceTimersByTimeAsync(30_001);
    await rejected;
    owned = false;
    await h.acknowledge('attraccess/wago/discovery/fixture/claim/ack', { acknowledgementToken: token });
    expect(h.provider.revoke).not.toHaveBeenCalled();
    expect(h.record.mock.calls.map(([event]) => event.outcome)).toEqual(['attempted', 'failed']);
    h.service.onModuleDestroy();
  });

  it('does not audit successful fallback or revoke permanent credentials when acknowledgement is missing', async () => {
    jest.useFakeTimers();
    const h = fixture(false);
    const result = h.service.completeManualCredentials(
      7,
      { name: 'Fixture', verifier: 'pair', username: 'wago-controller-fixture', password: privateValue },
      principal,
    );
    const rejected = expect(result).rejects.toThrow('acknowledgement timed out');
    await jest.advanceTimersByTimeAsync(30_001);
    await rejected;
    expect(h.record).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'failed' }));
    expect(h.controller.trustState).toBe('claimed');
    expect(h.provider.revoke).not.toHaveBeenCalled();
    h.service.onModuleDestroy();
  });
});
