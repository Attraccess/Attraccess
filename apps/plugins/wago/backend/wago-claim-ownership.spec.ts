import { createHash } from 'node:crypto';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './controllers/service';
import { createWagoTestStorage } from './storage/testing';

describe('commissioning ownership through WAGO broker continuations', () => {
  async function fixture(claimed = false) {
    const test = createWagoTestStorage();
    const { tables } = test;
    const now = '2026-01-01T00:00:00.000Z';
    await tables.controllers.insert({
      id: 1,
      hardwareId: 'fixture',
      trustState: claimed ? 'claimed' : 'untrusted',
      mqttServerId: 1,
      enrollmentId: claimed ? null : 7,
      pairingCodeHash: createHash('sha256').update('fixture-code').digest('hex'),
      compatibilityError: null,
      protocolVersion: '1.0.0',
      runtimeVersion: '1.0.0',
      capabilities: '[]',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const enrollment = await tables.enrollments.insert({
      id: 7,
      hardwareId: 'fixture',
      mqttServerId: 1,
      secretHash: 'secret-hash',
      identity: 'enrollment-fixture',
      createdAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const provider = { provision: jest.fn(), revoke: jest.fn().mockResolvedValue(undefined) };
    const context = {
      getMqttServerConfig: jest.fn().mockResolvedValue({}),
      getMqttCredentialProvisioning: () => provider,
      mqtt: { publish: jest.fn(), subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }) },
      logger: { warn: jest.fn() },
      storage: { open: () => tables },
      persistence: test.persistence,
    };
    const service = new WagoService(context as unknown as PluginContext);
    Object.assign(service, {
      storage: tables,
      controllers: tables.controllers,
      enrollments: tables.enrollments,
      drafts: tables.configurationDrafts,
      revisions: tables.configurationRevisions,
      settings: tables.settings,
    });
    jest
      .spyOn(service, 'getSettings')
      .mockResolvedValue({ operationalPrefix: 'attraccess/wago', defaultMqttServerId: 1 } as never);
    return { service, provider, context, tables, test, enrollment };
  }

  it('retains permanent provisioning intent after lease loss and revokes it on later removal', async () => {
    const { service, provider, context, tables, test } = await fixture();
    let resolve!: (value: object) => void;
    let entered!: () => void;
    const started = new Promise<void>((ready) => {
      entered = ready;
    });
    provider.provision.mockImplementation(() => {
      entered();
      return new Promise((ready) => {
        resolve = ready;
      });
    });
    let owned = true;
    const assertOwned = async () => {
      if (!owned) throw new Error('lease_lost');
    };
    const claim = service.claim(1, 'Fixture', 'fixture-code', 1, assertOwned);
    await started;
    expect(test.rows('controllers')[0]).toMatchObject({ credentialMqttServerId: 1, trustState: 'untrusted' });
    owned = false;
    resolve({ username: 'permanent-fixture', password: 'synthetic-only' });
    await expect(claim).rejects.toThrow('lease_lost');
    // The lease loss leaves only the provisioning intent: no claimed state, no delivery, no revocation.
    expect(test.rows('controllers')[0]).toMatchObject({ credentialMqttServerId: 1, trustState: 'untrusted' });
    expect(context.mqtt.publish).not.toHaveBeenCalled();
    expect(provider.revoke).not.toHaveBeenCalled();
    // Later discovery selecting another broker cannot redirect permanent revocation.
    await tables.controllers.update({ id: 1 }, { mqttServerId: 2 });
    await service.remove(1);
    expect(provider.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ mqttServerId: 1, identity: 'wago-controller-fixture' }),
    );
    expect(test.rows('controllers')).toEqual([]);
    service.onModuleDestroy();
  });

  it('does not delete controller state after ownership is lost while revoking its broker identity', async () => {
    const { service, provider, test, tables } = await fixture(true);
    await tables.configurationDrafts.insert({ controllerId: 1, snapshot: '{}', updatedAt: '2026-01-01T00:00:00.000Z' });
    let owned = true;
    provider.revoke.mockImplementation(async () => {
      owned = false;
    });
    await expect(
      service.remove(1, async () => {
        if (!owned) throw new Error('lease_lost');
      }),
    ).rejects.toThrow('lease_lost');
    expect(test.rows('controllers')).toHaveLength(1);
    expect(test.rows('configurationDrafts')).toHaveLength(1);
    service.onModuleDestroy();
  });

  it('revokes an expired enrollment instead of silently treating expiry as broker revocation', async () => {
    const { service, provider, tables, test } = await fixture();
    await tables.enrollments.update({ id: 7 }, { expiresAt: '2020-01-01T00:00:00.000Z' });
    await service.revokeEnrollmentById(7);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect(test.rows('enrollments')[0]).toMatchObject({ revokedAt: expect.any(String) });
    service.onModuleDestroy();
  });
});
