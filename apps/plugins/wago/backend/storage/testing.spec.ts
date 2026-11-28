import { createWagoTestStorage } from './testing';

describe('createWagoTestStorage', () => {
  it('serves every WAGO table with the declared defaults and keys', async () => {
    const test = createWagoTestStorage();
    const settings = await test.tables.settings.insert({});
    expect(settings).toEqual({ id: 1, defaultMqttServerId: null, operationalPrefix: 'attraccess/wago' });
    const controller = await test.tables.controllers.insert({
      hardwareId: 'cc100-01',
      trustState: 'untrusted',
      pairingCodeHash: '',
      protocolVersion: '1',
      runtimeVersion: '1',
      capabilities: '[]',
      lastSeenAt: 'now',
      createdAt: 'now',
      updatedAt: 'now',
    });
    expect(controller).toMatchObject({ id: 1, lastSequence: '0', name: null });
    await test.tables.networkChanges.insert({
      controllerId: 1,
      sessionId: 1,
      fingerprint: 'f',
      targetHost: 'h',
      phase: 'connecting',
      updatedAt: 'now',
    });
    await test.persistence.transaction(async (scope) => {
      await test.tables.controllers.delete({ id: 1 }, { scope });
    });
    expect(test.rows('networkChanges')).toEqual([]);
  });
});
