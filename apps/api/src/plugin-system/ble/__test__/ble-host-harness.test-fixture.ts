import { Attractap, entities } from '@attraccess/database-entities';
import {
  normalizeBleAddress,
  type FakeBleHost,
  type FakeBleOpenSession,
  type FakeBleOperation,
  type PluginBleContext,
} from '@attraccess/plugins-backend-sdk';
import type { ModuleRef } from '@nestjs/core';
import { DataSource, Table } from 'typeorm';
import { PluginBleTransport1793200000000 } from '../../../database/migrations/1793200000000-plugin-ble-transport';
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
  const source = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: Object.values(entities),
  }).initialize();
  const queryRunner = source.createQueryRunner();
  try {
    await queryRunner.createTable(Table.create(source.getMetadata(Attractap), source.driver));
    // The real migration creates the endpoint table, including its cascading foreign key to the reader.
    await new PluginBleTransport1793200000000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }

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
  const service = new PluginBleService(source, moduleRef);
  service.clock = clock;

  const host: HostBleHarness = {
    service,
    driver,
    transcript: driver.transcript,
    dispose: async () => {
      await service.onModuleDestroy();
      await source.destroy();
    },
    contextFor(pluginId): PluginBleContext {
      return createPluginBleContext({ id: pluginId, logger: silentLogger }, () => {
        if (!ready) throw new Error('Host not ready');
        return service;
      });
    },
    addReader: (async (reader: { readerId: number; name: string; allowPluginBle?: boolean; available?: boolean }) => {
      await source.getRepository(Attractap).insert({
        id: reader.readerId,
        name: reader.name,
        apiTokenHash: 'hash',
        allowPluginBle: reader.allowPluginBle ?? false,
      } as Attractap);
      driver.available.set(reader.readerId, reader.available ?? true);
    }) as FakeBleHost['addReader'],
    async removeReader(readerId) {
      await source.getRepository(Attractap).delete(readerId);
      // AttractapService emits this after the delete; the row cascade already removed the endpoints.
      await service.onReaderDeleted(new ReaderDeletedEvent(readerId));
    },
    async setReaderAccess(readerId, allowed) {
      await source.getRepository(Attractap).update(readerId, { allowPluginBle: allowed });
      await service.onReaderUpdated(new ReaderUpdatedEvent({ id: readerId, allowPluginBle: allowed } as Attractap));
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
      [...(service as unknown as { sessions: Map<string, never> }).sessions.values()].map(
        (entry: {
          session: { id: string; endpointId: string };
          pluginId: string;
          readerId: number;
          address: string;
        }) => ({
          id: entry.session.id,
          pluginId: entry.pluginId,
          endpointId: entry.session.endpointId,
          readerId: entry.readerId,
          address: entry.address,
        }),
      ),
  };
  return host;
}
