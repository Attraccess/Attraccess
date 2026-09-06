import { createHash } from 'node:crypto';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';

describe('commissioning ownership through WAGO broker continuations', () => {
  function fixture(claimed = false) {
    const controller = {
      id: 1,
      hardwareId: 'fixture',
      trustState: claimed ? 'claimed' : 'untrusted',
      mqttServerId: 1,
      enrollmentId: claimed ? null : 7,
      pairingCodeHash: createHash('sha256').update('fixture-code').digest('hex'),
      compatibilityError: null,
    };
    const enrollment = {
      id: 7,
      hardwareId: 'fixture',
      mqttServerId: 1,
      identity: 'enrollment-fixture',
      revokedAt: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const provider = { provision: jest.fn(), revoke: jest.fn().mockResolvedValue(undefined) };
    const context = {
      getMqttServerConfig: jest.fn().mockResolvedValue({}),
      getMqttCredentialProvisioning: () => provider,
      mqtt: { publish: jest.fn(), subscribe: jest.fn() },
      logger: { warn: jest.fn() },
    };
    const service = new WagoService(context as unknown as PluginContext);
    const controllers = { findOneBy: jest.fn().mockResolvedValue(controller), save: jest.fn(), delete: jest.fn() };
    const enrollments = {
      findOneBy: jest.fn().mockResolvedValue(enrollment),
      create: jest.fn().mockImplementation((row) => ({ id: 7, ...row })),
      save: jest.fn().mockImplementation(async (row) => row),
    };
    service['controllers'] = controllers as never;
    service['enrollments'] = enrollments as never;
    service['drafts'] = { delete: jest.fn() } as never;
    service['revisions'] = { delete: jest.fn() } as never;
    jest
      .spyOn(service, 'getSettings')
      .mockResolvedValue({ operationalPrefix: 'attraccess/wago', defaultMqttServerId: 1 } as never);
    return { service, provider, context, controllers, enrollment, enrollments };
  }

  it('does not save, publish or rollback a claim after its provisioning continuation loses ownership', async () => {
    const { service, provider, context, controllers } = fixture();
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
    owned = false;
    resolve({ username: 'permanent-fixture', password: 'synthetic-only' });
    await expect(claim).rejects.toThrow('lease_lost');
    expect(controllers.save).not.toHaveBeenCalled();
    expect(context.mqtt.publish).not.toHaveBeenCalled();
    expect(provider.revoke).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('does not delete controller state after ownership is lost while revoking its broker identity', async () => {
    const { service, provider, controllers } = fixture(true);
    let owned = true;
    provider.revoke.mockImplementation(async () => {
      owned = false;
    });
    await expect(
      service.remove(1, async () => {
        if (!owned) throw new Error('lease_lost');
      }),
    ).rejects.toThrow('lease_lost');
    expect(controllers.delete).not.toHaveBeenCalled();
    expect(service['drafts'].delete).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('revokes an expired enrollment instead of silently treating expiry as broker revocation', async () => {
    const { service, provider, enrollment, enrollments } = fixture();
    enrollment.expiresAt = '2020-01-01T00:00:00.000Z';
    await service.revokeEnrollmentById(7);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect(enrollments.save).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(String) }));
    service.onModuleDestroy();
  });

  it('persists the enrollment identity before provisioning and retains it when ownership is lost', async () => {
    const { service, provider, enrollments } = fixture();
    let owned = true;
    provider.provision.mockImplementation(async ({ username }) => {
      expect(enrollments.save).toHaveBeenCalledWith(expect.objectContaining({ identity: username }));
      owned = false;
      return { username, password: 'synthetic-only' };
    });
    try {
      await expect(
        service.createEnrollment('fixture', 1, undefined, async () => {
          if (!owned) throw new Error('lease_lost');
        }),
      ).rejects.toThrow('lease_lost');
      expect(enrollments.save).toHaveBeenCalledTimes(1);
      const intent = enrollments.save.mock.calls[0][0];
      expect(service['enrollmentExpiryTimers'].has(intent.id)).toBe(true);
      enrollments.findOneBy.mockResolvedValue(intent);
      await service.revokeEnrollmentById(intent.id);
      expect(provider.revoke).toHaveBeenCalledWith(expect.objectContaining({ username: intent.identity }));
    } finally {
      service.onModuleDestroy();
    }
  });
});
