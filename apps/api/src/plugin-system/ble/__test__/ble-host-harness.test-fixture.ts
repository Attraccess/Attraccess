import {
  normalizeBleAddress,
  type FakeBleHost,
  type FakeBleOpenSession,
  type FakeBleOperation,
  type PluginBleContext,
} from '@attraccess/plugins-backend-sdk';
import type { AttractapReader } from '@attraccess/application-models';
import type { ModuleRef } from '@nestjs/core';
import { createPluginBleTestDatabase } from '../../../database/adapters/plugins/plugin-ble-database.test-fixture';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../../attractap/events';
import { BLE_TRANSPORT_DRIVER } from '../ble-transport-driver';
import { createPluginBleContext } from '../plugin-ble-context';
import { clearPluginBleProfiles } from '../plugin-ble-profile-registry';
import { PluginBleService } from '../plugin-ble.service';
import { BleTestDriver, ManualClock } from './ble-test-driver.test-fixture';

/** The host implementation behind the same control surface as the SDK fake, for the shared contract suite. */
export interface HostBleHarness extends FakeBleHost {
  service: PluginBleService;
  driver: BleTestDriver;
  dispose(): Promise<void>;
}

const silentLogger = { log: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };

export async function createHostBleHarness(
  options: { ready?: boolean; withDriver?: boolean } = {},
): Promise<HostBleHarness> {
  clearPluginBleProfiles();
  const database = await createPluginBleTestDatabase();

  const clock = new ManualClock();
  const driver = new BleTestDriver(clock);
  let driverPresent = options.withDriver ?? true;
  let ready = options.ready ?? true;
  const moduleRef = {
    get: (token: unknown) => {
      if (token === BLE_TRANSPORT_DRIVER && driverPresent) return driver;
      throw new Error('not found');
    },
  } as unknown as ModuleRef;
  const service = new PluginBleService(database.store, moduleRef);
  service.clock = clock;

  const host: HostBleHarness = {
    service,
    driver,
    transcript: driver.transcript,
    dispose: async () => {
      await service.onModuleDestroy();
      await database.dispose();
    },
    contextFor(pluginId): PluginBleContext {
      return createPluginBleContext({ id: pluginId, logger: silentLogger }, () => {
        if (!ready) throw new Error('Host not ready');
        return service;
      });
    },
    addReader: (async (reader: { readerId: number; name: string; allowPluginBle?: boolean; available?: boolean }) => {
      await database.addReader({
        id: reader.readerId,
        name: reader.name,
        allowPluginBle: reader.allowPluginBle ?? false,
      });
      driver.available.set(reader.readerId, reader.available ?? true);
    }) as FakeBleHost['addReader'],
    async removeReader(readerId) {
      await database.deleteReader(readerId);
      // AttractapService emits this after the delete; the row cascade already removed the endpoints.
      await service.onReaderDeleted(new ReaderDeletedEvent(readerId));
    },
    async setReaderAccess(readerId, allowed) {
      await database.setReaderAccess(readerId, allowed);
      await service.onReaderUpdated(
        new ReaderUpdatedEvent({ id: readerId, allowPluginBle: allowed } as AttractapReader),
      );
    },
    setReaderAvailable: (readerId, available) => void driver.available.set(readerId, available),
    setTransportAvailable: (available) => {
      driverPresent = available;
    },
    setReady: (value) => {
      ready = value;
    },
    addPeripheral: (peripheral) => driver.addPeripheral(peripheral),
    notify: (address, uuid, bytes) => driver.notify(address, uuid, bytes),
    disconnect: async (address) => {
      driver.dropLink(normalizeBleAddress(address));
      await clock.advance(0);
    },
    failNext: (op: FakeBleOperation, code, failOptions) => driver.failNext(op, code, failOptions?.detail),
    advance: (ms) => clock.advance(ms),
    shutdownPlugin: (pluginId) => service.closePluginSessions(pluginId, 'shutdown'),
    uninstallPlugin: (pluginId) => service.deleteAllForPlugin(pluginId),
    openSessions: (): FakeBleOpenSession[] =>
      service.listOpenSessions().map(({ sessionId, pluginId, endpointId, readerId, address }) => ({
        id: sessionId,
        pluginId,
        endpointId,
        readerId,
        address,
      })),
  };
  return host;
}
