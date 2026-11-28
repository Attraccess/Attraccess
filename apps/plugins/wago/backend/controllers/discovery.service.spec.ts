import { PluginStorageUniqueViolation } from '@attraccess/plugins-backend-sdk';
import type { WagoEnrollment } from './enrollment.entity';
import { controller, createWagoServiceFixture } from '../wago-service.test-fixture';
import { hash } from './model';
import { WagoService } from './service';
import { MAX_STORED_SEQUENCE } from '../storage';

describe('WagoService discovery', () => {
  const services: WagoService[] = [];
  const secret = 'enrollment-secret';
  const topic = 'attraccess/wago/discovery/cc100-01';

  afterEach(() => {
    services.splice(0).forEach((service) => service.onModuleDestroy());
  });

  const enrollment = (overrides: Partial<WagoEnrollment> = {}): WagoEnrollment => ({
    id: 3,
    mqttServerId: 2,
    hardwareId: 'cc100-01',
    secretHash: hash(secret),
    identity: 'wago-enrollment-test',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revokedAt: null,
    consumedAt: null,
    ...overrides,
  });

  const announcement = (overrides: Record<string, unknown> = {}) =>
    Buffer.from(
      JSON.stringify({
        hardwareId: 'cc100-01',
        enrollmentSecret: secret,
        pairingCode: 'pairing',
        fingerprint: 'fingerprint',
        protocolVersion: '1.0.0',
        runtimeVersion: '1.2.3',
        capabilities: ['claim'],
        sequence: 9,
        ...overrides,
      }),
    );

  type Discovery = { onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void> };
  async function setup(controllers: ReturnType<typeof controller>[] = [], enrollments = [enrollment()]) {
    const fixture = await createWagoServiceFixture(services, controllers, enrollments, 2);
    const discover = (payload: Buffer, discoveryTopic = topic, serverId = 2) =>
      (fixture.service as unknown as Discovery).onDiscovery(serverId, discoveryTopic, payload);
    return { ...fixture, discover, warnings: () => jest.mocked(fixture.context.logger.warn).mock.calls.flat() };
  }

  it('stores a new announcement as an untrusted controller and offers it for commissioning', async () => {
    const { service, test, discover, warnings } = await setup();
    const offered = jest.fn().mockResolvedValue(undefined);
    service.registerCommissioningDiscoveryHandler(offered);

    await discover(announcement());

    expect(test.rows('controllers')).toEqual([
      expect.objectContaining({
        hardwareId: 'cc100-01',
        trustState: 'untrusted',
        mqttServerId: 2,
        enrollmentId: 3,
        pairingCodeHash: hash('pairing'),
        fingerprint: 'fingerprint',
        runtimeVersion: '1.2.3',
        capabilities: '["claim"]',
        lastSequence: '9',
      }),
    ]);
    expect(offered).toHaveBeenCalledWith(expect.objectContaining({ hardwareId: 'cc100-01', trustState: 'untrusted' }));
    expect(warnings()).toEqual([]);
  });

  it('stores the epoch-millisecond sequence a CC100 runtime announces', async () => {
    const { test, discover } = await setup();
    const sequence = Date.UTC(2026, 10, 27, 16, 50, 34);
    await discover(announcement({ sequence }));
    expect(test.rows('controllers')[0]).toMatchObject({ lastSequence: String(sequence) });
  });

  it('ignores an announcement whose sequence the controller row cannot store', async () => {
    const { test, discover } = await setup();
    await discover(announcement({ sequence: MAX_STORED_SEQUENCE + 1 }));
    expect(test.rows('controllers')).toEqual([]);
  });

  it('stores an announcement whose identity, fingerprint and versions exceed 255 characters', async () => {
    const hardwareId = `cc100-${'h'.repeat(300)}`;
    const long = (prefix: string) => `${prefix}${'x'.repeat(300)}`;
    const { test, discover } = await setup([], [enrollment({ hardwareId })]);

    await discover(
      announcement({
        hardwareId,
        fingerprint: long('fp-'),
        protocolVersion: long('1.0.0+'),
        runtimeVersion: long('1.2.3+'),
      }),
      `attraccess/wago/discovery/${hardwareId}`,
    );

    expect(test.rows('controllers')).toEqual([
      expect.objectContaining({
        hardwareId,
        fingerprint: long('fp-'),
        protocolVersion: long('1.0.0+'),
        runtimeVersion: long('1.2.3+'),
      }),
    ]);
  });

  it('starts an announcement without a sequence at zero and without a fingerprint', async () => {
    const { test, discover } = await setup();

    await discover(announcement({ sequence: undefined, fingerprint: undefined }));

    expect(test.rows('controllers')[0]).toMatchObject({ lastSequence: '0', fingerprint: null });
  });

  it('refreshes an untrusted controller and keeps its sequence when the announcement has none', async () => {
    const { test, discover } = await setup([controller()]);

    await discover(announcement({ sequence: undefined, runtimeVersion: '2.0.0' }));
    expect(test.rows('controllers')[0]).toMatchObject({ runtimeVersion: '2.0.0', lastSequence: '4' });

    await discover(announcement({ sequence: 11 }));
    expect(test.rows('controllers')[0]).toMatchObject({ lastSequence: '11' });
  });

  it('never modifies a claimed controller', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, runtimeVersion: '1.0.0' };
    const { service, test, discover } = await setup([claimed]);
    const offered = jest.fn();
    service.registerCommissioningDiscoveryHandler(offered);

    await discover(announcement({ runtimeVersion: '9.9.9' }));

    expect(test.rows('controllers')[0]).toMatchObject({ trustState: 'claimed', runtimeVersion: '1.0.0' });
    expect(offered).not.toHaveBeenCalled();
  });

  it('does not offer a controller that a concurrent claim took over', async () => {
    const { service, tables, discover } = await setup([controller()]);
    const offered = jest.fn();
    service.registerCommissioningDiscoveryHandler(offered);
    jest.spyOn(tables.controllers, 'update').mockResolvedValue(0);

    await discover(announcement());

    expect(offered).not.toHaveBeenCalled();
  });

  it('ignores a topic that is not a single hardware ID', async () => {
    const { test, discover, warnings } = await setup();

    await discover(announcement(), 'attraccess/wago/discovery/');
    await discover(announcement(), 'attraccess/wago/discovery/cc100/01');

    expect(test.rows('controllers')).toEqual([]);
    expect(warnings()).toEqual([]);
  });

  it('ignores an invalid announcement and one for another hardware ID', async () => {
    const { test, discover, warnings } = await setup();

    await discover(Buffer.from('not json'));
    await discover(Buffer.from('[]'));
    await discover(announcement({ hardwareId: 'cc100-02' }));

    expect(test.rows('controllers')).toEqual([]);
    expect(warnings()).toEqual([
      expect.stringContaining('Ignoring invalid WAGO announcement: announcement is not valid JSON'),
      expect.stringContaining('Ignoring invalid WAGO announcement: announcement must be an object'),
      `Ignoring WAGO announcement with mismatched hardware ID on ${topic}`,
    ]);
  });

  it('ignores an announcement without an active enrollment secret for this broker and controller', async () => {
    const consumed = enrollment({ consumedAt: '2026-01-02T00:00:00.000Z' });
    const { test, discover, warnings } = await setup([], [consumed]);

    await discover(announcement({ enrollmentSecret: undefined }));
    await discover(announcement({ enrollmentSecret: 'wrong' }));
    await discover(announcement());
    await discover(announcement(), topic, 5);

    expect(test.rows('controllers')).toEqual([]);
    expect(warnings()).toEqual(
      Array(4).fill(`Ignoring WAGO announcement without a valid enrollment secret on ${topic}`),
    );
  });

  it('keeps the discovered controller when automatic commissioning fails', async () => {
    const { service, test, discover, warnings } = await setup();
    service.registerCommissioningDiscoveryHandler(jest.fn().mockRejectedValue(new Error('claim failed')));

    await discover(announcement());

    expect(test.rows('controllers')).toHaveLength(1);
    expect(warnings()).toEqual([
      'Could not automatically claim commissioned WAGO controller cc100-01: Error: claim failed',
    ]);
  });

  it('handles an announcement that lost the insert race as an update of the winner', async () => {
    const { tables, test, discover } = await setup();
    const insert = tables.controllers.insert.bind(tables.controllers);
    jest.spyOn(tables.controllers, 'insert').mockImplementationOnce(async (row) => {
      await insert({ ...row, runtimeVersion: 'winner' });
      throw new PluginStorageUniqueViolation();
    });

    await discover(announcement());

    expect(test.rows('controllers')).toHaveLength(1);
    expect(test.rows('controllers')[0]).toMatchObject({ runtimeVersion: '1.2.3', lastSequence: '9' });
  });

  it('rethrows any other storage failure', async () => {
    const { tables, discover } = await setup();
    jest.spyOn(tables.controllers, 'insert').mockRejectedValueOnce(new Error('database unavailable'));

    await expect(discover(announcement())).rejects.toThrow('database unavailable');
  });
});
