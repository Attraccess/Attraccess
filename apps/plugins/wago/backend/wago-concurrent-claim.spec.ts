import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './controllers/service';
import { createWagoTestStorage, type WagoTestStorage } from './storage/testing';

const NOW = '2026-01-01T00:00:00.000Z';

/**
 * Two API instances (replicas) share one store. Their claim locks are per process, so a claim of the same controller
 * on each instance only meets the other one in storage.
 */
describe('concurrent WAGO claims on two instances', () => {
  const services: WagoService[] = [];
  afterEach(() => services.splice(0).forEach((service) => service.onModuleDestroy()));

  async function seed(test: WagoTestStorage) {
    await test.tables.controllers.insert({
      id: 1,
      hardwareId: 'fixture',
      trustState: 'untrusted',
      mqttServerId: 1,
      enrollmentId: 7,
      pairingCodeHash: createHash('sha256').update('fixture-code').digest('hex'),
      protocolVersion: '1.0.0',
      runtimeVersion: '1.0.0',
      capabilities: '[]',
      lastSeenAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await test.tables.enrollments.insert({
      id: 7,
      hardwareId: 'fixture',
      mqttServerId: 1,
      secretHash: 'secret-hash',
      identity: 'enrollment-fixture',
      createdAt: NOW,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  /** One instance over the shared store. `serverConfig` runs after the instance read the controller. */
  function instance(test: WagoTestStorage, serverConfig: () => Promise<object>) {
    const provider = {
      availableProviders: jest.fn().mockResolvedValue([]),
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-fixture', password: 'synthetic-only' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    const context = {
      getMqttServerConfig: jest.fn(serverConfig),
      getMqttCredentialProvisioning: () => provider,
      mqtt: { publish: jest.fn(), subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }) },
      logger: { warn: jest.fn() },
      storage: { open: () => test.tables },
      persistence: test.persistence,
    };
    const service = new WagoService(context as unknown as PluginContext);
    services.push(service);
    Object.assign(service, {
      storage: test.tables,
      controllers: test.tables.controllers,
      enrollments: test.tables.enrollments,
      drafts: test.tables.configurationDrafts,
      revisions: test.tables.configurationRevisions,
      settings: test.tables.settings,
    });
    jest
      .spyOn(service, 'getSettings')
      .mockResolvedValue({ operationalPrefix: 'attraccess/wago', defaultMqttServerId: 1 } as never);
    return { service, provider, context };
  }

  it('lets one claim win; the loser neither provisions nor revokes the winner and leaves its row alone', async () => {
    const test = createWagoTestStorage();
    await seed(test);
    // Both instances read the untrusted controller before either writes its claim.
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const barrier = async () => {
      if (++arrived === 2) release();
      await bothRead;
      return {};
    };
    const first = instance(test, barrier);
    const second = instance(test, barrier);

    const results = await Promise.allSettled([
      first.service.claim(1, 'First', 'fixture-code', 1),
      second.service.claim(1, 'Second', 'fixture-code', 1),
    ]);

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(ConflictException);
    expect((lost[0].reason as Error).message).toBe('controller has already been claimed');
    // Exactly one permanent identity was issued, and nobody revoked it.
    expect(first.provider.provision.mock.calls.length + second.provider.provision.mock.calls.length).toBe(1);
    expect(first.provider.revoke).not.toHaveBeenCalled();
    expect(second.provider.revoke).not.toHaveBeenCalled();
    const winner = (won[0] as PromiseFulfilledResult<{ name: string | null; credentialEpoch: string | null }>).value;
    expect(test.rows('controllers')[0]).toMatchObject({
      trustState: 'claimed',
      name: winner.name,
      credentialMqttServerId: 1,
      credentialEpoch: winner.credentialEpoch,
    });
  });

  it('does not roll back a claim whose controller another claim has taken over meanwhile', async () => {
    const test = createWagoTestStorage();
    await seed(test);
    const { service, provider, context } = instance(test, async () => ({}));
    // The delivery fails after this claim was stored; by then another instance owns the controller and its identity.
    jest.mocked(context.mqtt.publish).mockImplementationOnce(async () => {
      await test.tables.controllers.update({ id: 1 }, { credentialEpoch: 'other-claim', name: 'Other' });
      throw new Error('broker unavailable');
    });

    await expect(service.claim(1, 'Mine', 'fixture-code', 1)).rejects.toThrow('broker unavailable');

    expect(provider.revoke).not.toHaveBeenCalled();
    expect(test.rows('controllers')[0]).toMatchObject({
      trustState: 'claimed',
      name: 'Other',
      credentialEpoch: 'other-claim',
      credentialMqttServerId: 1,
    });
  });

  it('revokes its identity when the controller was removed while the claim ran', async () => {
    const test = createWagoTestStorage();
    await seed(test);
    const { service, provider, context } = instance(test, async () => ({}));
    // Another instance removes the registration after this claim provisioned the identity.
    jest.mocked(context.mqtt.publish).mockImplementationOnce(async () => {
      await test.tables.controllers.delete({ id: 1 });
      throw new Error('broker unavailable');
    });

    await expect(service.claim(1, 'Mine', 'fixture-code', 1)).rejects.toThrow('broker unavailable');

    expect(provider.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ mqttServerId: 1, identity: 'wago-controller-fixture' }),
    );
    expect(test.rows('controllers')).toEqual([]);
  });

  it('still rolls back its own failed claim', async () => {
    const test = createWagoTestStorage();
    await seed(test);
    const { service, provider, context } = instance(test, async () => ({}));
    jest.mocked(context.mqtt.publish).mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.claim(1, 'Mine', 'fixture-code', 1)).rejects.toThrow('broker unavailable');

    expect(provider.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ mqttServerId: 1, identity: 'wago-controller-fixture' }),
    );
    expect(test.rows('controllers')[0]).toMatchObject({
      trustState: 'untrusted',
      name: null,
      credentialEpoch: null,
      credentialMqttServerId: null,
    });
  });
});
