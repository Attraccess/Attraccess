import type { WagoEnrollment } from './enrollment.entity';
import { controller, createWagoServiceFixture } from '../wago-service.test-fixture';
import { WagoService } from './service';

describe('WagoService enrollment and claim lifecycle', () => {
  const services: WagoService[] = [];

  afterEach(() => {
    services.splice(0).forEach((service) => service.onModuleDestroy());
  });

  function createService(
    controllers = [controller()],
    enrollments: WagoEnrollment[] = [],
    defaultMqttServerId: number | null = null,
  ) {
    return createWagoServiceFixture(services, controllers, enrollments, defaultMqttServerId);
  }

  /** A stored enrollment row. */
  const enrollmentRow = (overrides: Partial<WagoEnrollment> = {}): WagoEnrollment => ({
    id: 3,
    mqttServerId: 2,
    hardwareId: 'cc100-01',
    secretHash: 'secret-hash',
    identity: 'wago-enrollment-test',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revokedAt: null,
    consumedAt: null,
    ...overrides,
  });

  type Fixture = Awaited<ReturnType<typeof createService>>;
  const withBrokerConfig = (context: Fixture['context']) => {
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
  };

  it('revokes a claimed controller before deleting its local records', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, enrollmentId: null };
    const other = { ...controller(), id: 2, hardwareId: 'cc100-02', enrollmentId: null };
    const { service, context, tables, test } = await createService([claimed, other]);
    for (const controllerId of [1, 2]) {
      await tables.configurationDrafts.insert({ controllerId, snapshot: '{}', updatedAt: '2026-01-01T00:00:00.000Z' });
      await tables.configurationRevisions.insert({
        controllerId,
        revision: 1,
        snapshot: '{}',
        contentHash: 'hash',
        state: 'published',
        publishedAt: '2026-01-01T00:00:00.000Z',
      });
    }
    const revoke = jest.fn().mockResolvedValue(undefined);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });

    await expect(service.remove(claimed.id)).resolves.toBe(claimed.hardwareId);

    expect(revoke).toHaveBeenCalledWith({
      mqttServerId: claimed.mqttServerId,
      identity: `wago-controller-${claimed.hardwareId}`,
      username: `wago-controller-${claimed.hardwareId}`,
      vhost: '/',
    });
    expect(test.rows('configurationDrafts').map((row) => row.controllerId)).toEqual([2]);
    expect(test.rows('configurationRevisions').map((row) => row.controllerId)).toEqual([2]);
    expect(test.rows('controllers').map((row) => row.id)).toEqual([2]);
  });

  it('removes a controller together with its dependent records or not at all', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, enrollmentId: null };
    const { service, context, tables, test } = await createService([claimed]);
    await tables.configurationDrafts.insert({ controllerId: 1, snapshot: '{}', updatedAt: '2026-01-01T00:00:00.000Z' });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke: jest.fn() });
    jest.spyOn(tables.controllers, 'delete').mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.remove(claimed.id)).rejects.toThrow('database unavailable');

    expect(test.rows('configurationDrafts')).toHaveLength(1);
    expect(test.rows('controllers')).toHaveLength(1);
  });

  it('delivers the controller-scoped configuration namespace with claim credentials', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, test } = await createService([candidate], [enrollmentRow()]);
    const provision = jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' });
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision,
      revoke: jest.fn().mockResolvedValue(undefined),
    });

    await service.claim(candidate.id, 'Controller', 'fingerprint');

    expect(context.mqtt.publish).toHaveBeenCalledWith(
      2,
      'attraccess/wago/discovery/cc100-01/claim',
      expect.stringContaining('"desiredTopic":"attraccess/wago/v1/controllers/cc100-01/configuration/desired"'),
      { qos: 1 },
    );
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        topicPolicy: expect.objectContaining({
          subscribe: expect.arrayContaining(['attraccess/wago/v1/controllers/cc100-01/credentials/rotate']),
        }),
      }),
    );
    expect(test.rows('controllers')[0]).toMatchObject({ trustState: 'claimed', name: 'Controller', mqttServerId: 2 });
  });

  it('revokes bootstrap credentials only after the controller acknowledges durable claim storage', async () => {
    const enrollment = enrollmentRow();
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, test } = await createService([candidate], [enrollment]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke,
    });

    await service.claim(candidate.id, 'Controller', 'fingerprint');

    expect(revoke).not.toHaveBeenCalled();
    expect(test.rows('enrollments')[0]).toMatchObject({ revokedAt: null, consumedAt: null });
    const claimPayload = JSON.parse((context.mqtt.publish as jest.Mock).mock.calls[0][2]) as {
      acknowledgementToken: string;
    };
    const acknowledgementHandler = (context.mqtt.subscribe as jest.Mock).mock.calls[0][2] as (message: {
      payload: Buffer;
    }) => Promise<void>;
    await acknowledgementHandler({
      payload: Buffer.from(JSON.stringify({ acknowledgementToken: claimPayload.acknowledgementToken })),
    });

    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ identity: enrollment.identity }));
    expect(test.rows('enrollments')[0]).toMatchObject({
      revokedAt: expect.any(String),
      consumedAt: expect.any(String),
    });
  });

  it('serializes concurrent claims for the same controller', async () => {
    const { service } = await createService();
    const withClaimLock = (
      Reflect.get(service, 'withClaimLock') as <T>(id: number, operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    const started: number[] = [];
    let release!: () => void;
    const first = withClaimLock(1, async () => {
      started.push(1);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const second = withClaimLock(1, async () => started.push(2));

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual([1]);
    release();
    await Promise.all([first, second]);
    expect(started).toEqual([1, 2]);
  });

  it('does not block unrelated claims while delivering credentials', async () => {
    const first = { ...controller(), enrollmentId: 3, fingerprint: 'first-fingerprint' };
    const second = {
      ...controller(),
      id: 2,
      hardwareId: 'cc100-02',
      enrollmentId: 4,
      fingerprint: 'second-fingerprint',
    };
    const enrollments = [
      enrollmentRow({
        id: 3,
        hardwareId: first.hardwareId,
        secretHash: 'first',
        identity: 'enrollment-first',
        expiresAt: '2999-01-01T00:00:00.000Z',
      }),
      enrollmentRow({
        id: 4,
        hardwareId: second.hardwareId,
        secretHash: 'second',
        identity: 'enrollment-second',
        expiresAt: '2999-01-01T00:00:00.000Z',
      }),
    ];
    const { service, context } = await createService([first, second], enrollments);
    withBrokerConfig(context);
    const provision = jest.fn().mockImplementation(({ username }) => ({ username, password: 'permanent-password' }));
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ provision, revoke: jest.fn() });
    let releaseFirstDelivery!: () => void;
    const firstDelivery = new Promise<void>((resolve) => {
      releaseFirstDelivery = resolve;
    });
    (context.mqtt.publish as jest.Mock).mockImplementation(async (_serverId, topic) => {
      if (topic === `${'attraccess/wago/discovery'}/cc100-01/claim`) await firstDelivery;
    });

    const firstClaim = service.claim(first.id, 'First', first.fingerprint);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const secondClaim = service.claim(second.id, 'Second', second.fingerprint);

    await expect(
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('second claim was blocked by credential delivery')), 100);
        const wait = () => {
          if (provision.mock.calls.length === 2) {
            clearTimeout(timer);
            resolve();
          } else setImmediate(wait);
        };
        wait();
      }),
    ).resolves.toBeUndefined();
    releaseFirstDelivery();
    await Promise.all([firstClaim, secondClaim]);
  });

  it('keeps a manually revocable enrollment active', async () => {
    const enrollment = enrollmentRow({ expiresAt: '2026-01-01T01:00:00.000Z' });
    const { service, context, test } = await createService([], [enrollment]);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      revoke: jest.fn().mockResolvedValue({ instructions: ['Remove this account manually.'] }),
    });
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await expect(revokeEnrollment(enrollment)).rejects.toThrow('Manual credential revocation is required');

    expect(enrollment.consumedAt).toBeNull();
    expect(test.rows('enrollments')[0]).toMatchObject({ revokedAt: null, consumedAt: null });
  });

  it('revokes an expired enrollment credential before commissioning deletes its record', async () => {
    const enrollment = enrollmentRow({ identity: 'wago-enrollment-expired', expiresAt: '2020-01-01T00:00:00.000Z' });
    const { service, context, test } = await createService([], [enrollment]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });

    await service.revokeEnrollmentById(enrollment.id);

    expect(revoke).toHaveBeenCalledWith({
      mqttServerId: enrollment.mqttServerId,
      identity: enrollment.identity,
      username: enrollment.identity,
      vhost: '/',
    });
    expect(test.rows('enrollments')[0]).toMatchObject({
      revokedAt: expect.any(String),
      consumedAt: expect.any(String),
    });
  });

  it('returns administrator supplied manual credentials when automatic provisioning is unavailable', async () => {
    const { service, context, test } = await createService([], [], 2);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockImplementation(({ username }) => ({
        instructions: [`Create a scoped broker user named ${username} manually.`],
      })),
    });

    const enrollment = await service.createEnrollment('cc100-01', undefined, {
      username: 'manual-$&',
      password: 'secret',
    });

    expect(enrollment).toMatchObject({ username: 'manual-$&', password: 'secret' });
    expect(enrollment.manualInstructions).toEqual(['Create a scoped broker user named manual-$& manually.']);
    expect(test.rows('enrollments')[0]).toMatchObject({ id: enrollment.id, identity: 'manual-$&' });
    service.onModuleDestroy();
  });

  it('discards a manual enrollment recovery record when credentials are not supplied', async () => {
    const { service, context, test } = await createService([], [], 2);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ instructions: ['Create the scoped broker user manually.'] }),
    });

    await expect(service.createEnrollment('cc100-01')).rejects.toThrow('Manual discovery credentials are required');

    expect(test.rows('enrollments')).toEqual([]);
    expect(service['enrollmentExpiryTimers'].size).toBe(0);
  });

  it.each(['cc100/+1', 'cc100/#1'])('rejects MQTT wildcard characters in hardware IDs', async (hardwareId) => {
    const { service } = await createService();

    await expect(service.createEnrollment(hardwareId)).rejects.toThrow('without MQTT separators or wildcards');
  });

  it('persists an enrollment recovery record before provisioning the broker credential', async () => {
    const { service, context, test } = await createService([], [], 2);
    const stored: unknown[][] = [];
    const provision = jest.fn().mockImplementation(async () => {
      stored.push(test.rows('enrollments'));
      return { username: 'ignored', password: 'secret' };
    });
    const assertOwned = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ provision });

    await expect(service.createEnrollment('cc100-01', undefined, undefined, assertOwned)).rejects.toThrow('lease lost');

    expect(stored).toEqual([
      [expect.objectContaining({ hardwareId: 'cc100-01', identity: expect.stringMatching(/^wago-enrollment-/) })],
    ]);
    service.onModuleDestroy();
  });

  it('leaves bootstrap credentials available until expiry after a post-delivery claim failure', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, test } = await createService([candidate], [enrollmentRow()]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke,
    });
    (context.mqtt.publish as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toThrow('cleanup failed');

    expect(test.rows('controllers')[0]).toMatchObject({ trustState: 'claimed' });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('preserves the claim failure when restoring the controller state fails', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, tables } = await createService([candidate], [enrollmentRow()]);
    const claimError = new Error('credential delivery failed');
    const rollbackError = new Error('controller rollback failed');
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    (context.mqtt.publish as jest.Mock).mockRejectedValue(claimError);
    const update = tables.controllers.update.bind(tables.controllers);
    let writes = 0;
    jest.spyOn(tables.controllers, 'update').mockImplementation(async (where, patch, options) => {
      // Provisioning intent and claimed state persist; the rollback to unclaimed fails.
      if (++writes === 3) throw rollbackError;
      return update(where, patch, options);
    });

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toBe(claimError);

    expect(context.logger.warn).toHaveBeenCalledWith(
      `Could not restore WAGO controller ${candidate.id} after claim failure: Error: controller rollback failed`,
    );
  });

  it('restores the unclaimed controller when credential delivery fails', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, test } = await createService([candidate], [enrollmentRow()]);
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    (context.mqtt.publish as jest.Mock).mockRejectedValue(new Error('credential delivery failed'));

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toThrow(
      'credential delivery failed',
    );

    expect(test.rows('controllers')[0]).toMatchObject({
      trustState: 'untrusted',
      name: null,
      credentialMqttServerId: null,
      credentialEpoch: null,
    });
  });

  it('refuses to claim a controller another claim won meanwhile', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, tables } = await createService([candidate], [enrollmentRow()]);
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    const get = tables.controllers.get.bind(tables.controllers);
    jest.spyOn(tables.controllers, 'get').mockImplementationOnce(async (key, options) => {
      const read = await get(key, options);
      // Another writer claims the controller after this claim read it as untrusted.
      await tables.controllers.update({ id: candidate.id }, { trustState: 'claimed', name: 'Winner' });
      return read;
    });

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toThrow(
      'controller has already been claimed',
    );
    expect(context.mqtt.publish).not.toHaveBeenCalled();
    expect(await tables.controllers.get(candidate.id)).toMatchObject({ trustState: 'claimed', name: 'Winner' });
  });

  it('releases the claim configuration lock after preparation fails', async () => {
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, tables } = await createService([candidate], [enrollmentRow()]);
    const claimError = new Error('could not persist claimed controller');
    withBrokerConfig(context);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    jest.spyOn(tables.controllers, 'update').mockRejectedValueOnce(claimError);

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toBe(claimError);
    const withClaimConfigurationLock = (
      Reflect.get(service, 'withClaimConfigurationLock') as <T>(operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    await expect(withClaimConfigurationLock(async () => 'available')).resolves.toBe('available');
  });

  it('does not treat revoked enrollments as active', async () => {
    const { service } = await createService();
    const isActiveEnrollment = Reflect.get(service, 'isActiveEnrollment') as (item: WagoEnrollment) => boolean;

    expect(isActiveEnrollment(enrollmentRow({ revokedAt: '2026-01-01T00:00:00.000Z' }))).toBe(false);
  });

  it('retains revocation progress when recording consumption fails', async () => {
    const enrollment = enrollmentRow();
    const { service, context, tables } = await createService([], [enrollment]);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    jest.spyOn(tables.enrollments, 'update').mockRejectedValue(new Error('database unavailable'));
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await expect(revokeEnrollment(enrollment)).rejects.toThrow('database unavailable');

    expect(enrollment.revokedAt).not.toBeNull();
    expect(enrollment.consumedAt).toBeNull();
  });

  it('does not revoke credentials again after revocation was recorded', async () => {
    const enrollment = enrollmentRow({ revokedAt: '2026-01-01T00:00:00.000Z' });
    const { service, context, test } = await createService([], [enrollment]);
    const revoke = jest.fn();
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await revokeEnrollment(enrollment);

    expect(revoke).not.toHaveBeenCalled();
    expect(test.rows('enrollments')[0]).toMatchObject({ consumedAt: expect.any(String) });
  });
});
