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
import { PluginBleTransport1793300000000 } from '../../../database/migrations/1793300000000-plugin-ble-transport';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../../attractap/events';
import { BLE_TRANSPORT_DRIVER } from '../ble-transport-driver';
import { createPluginBleContext } from '../plugin-ble-context';
import { clearPluginBleProfiles } from '../plugin-ble-profile-registry';
import { PluginBleService } from '../plugin-ble.service';
import { BleTestDriver, ManualClock } from './ble-test-driver.test-fixture';
import {
  createFakeReaderSocket,
  FAKE_READER_BLE_CAPABILITY,
  type FakeBleReaderFirmware,
} from '../../../attractap/websockets/handlers/ble/__test__/fake-ble-reader.test-fixture';
import { parseBleCapability } from '../../../attractap/websockets/handlers/ble/ble-wire';
import { ReaderBleDriver } from '../../../attractap/websockets/handlers/ble/reader-ble.driver';
import { WebsocketService } from '../../../attractap/websockets/websocket.service';
import type { AuthenticatedWebSocket } from '../../../attractap/websockets/websocket.types';

/** The host implementation behind the same control surface as the SDK fake, for the shared contract suite. */
export interface HostBleHarness extends FakeBleHost {
  service: PluginBleService;
  /** The in-memory radio: the driver itself, or the radio behind the fake readers (`reader-websocket`). */
  driver: BleTestDriver;
  /** `reader-websocket` only: the real reader driver and the fake reader connection of each reader. */
  readerDriver?: ReaderBleDriver;
  readers: Map<number, { socket: AuthenticatedWebSocket; firmware: FakeBleReaderFirmware }>;
  /**
   * `reader-websocket` only: the reader connects again on a new websocket. `halfOpen`: the old socket stays open, as
   * a TCP connection does after a reader reset until the heartbeat times out.
   */
  reconnectReader(readerId: number, options?: { halfOpen?: boolean }): void;
  clock: ManualClock;
  dispose(): Promise<void>;
}

const silentLogger = { log: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };

export async function createHostBleHarness(
  options: {
    ready?: boolean;
    withDriver?: boolean;
    /** `reader-websocket`: the real `ReaderBleDriver`, talking protocol v1 to fake reader firmware. */
    transport?: 'test-driver' | 'reader-websocket';
  } = {},
): Promise<HostBleHarness> {
  clearPluginBleProfiles();
  const source = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: Object.values(entities),
  }).initialize();
  const queryRunner = source.createQueryRunner();
  try {
    await queryRunner.createTable(Table.create(source.getMetadata(Attractap), source.driver));
    // The real migration creates the endpoint table, including its cascading foreign key to the reader.
    await new PluginBleTransport1793300000000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }

  const clock = new ManualClock();
  const driver = new BleTestDriver(clock);
  let driverPresent = options.withDriver ?? true;
  let ready = options.ready ?? true;

  const websocket = options.transport === 'reader-websocket';
  const websocketService = new WebsocketService();
  const readerDriver = websocket ? new ReaderBleDriver(websocketService) : undefined;
  if (readerDriver) readerDriver.clock = clock;
  const readers: HostBleHarness['readers'] = new Map();
  let connections = 0;
  const connectReader = (readerId: number) => {
    if (!readerDriver) return;
    const reader = createFakeReaderSocket({
      id: `fake-${++connections}`,
      readerId,
      radio: driver,
      deliver: (socket, eventData) => readerDriver.handleMessage(socket, eventData),
    });
    readers.set(readerId, reader);
    websocketService.sockets.set(reader.socket.id, reader.socket);
  };
  const dropReader = (readerId: number) => {
    const reader = readers.get(readerId);
    if (!reader || !readerDriver) return;
    readers.delete(readerId);
    (reader.socket as unknown as { readyState: number }).readyState = 3;
    websocketService.sockets.delete(reader.socket.id);
    reader.firmware.linkLost();
    readerDriver.socketClosed(reader.socket);
  };

  const moduleRef = {
    get: (token: unknown) => {
      if (token === BLE_TRANSPORT_DRIVER && driverPresent) return readerDriver ?? driver;
      throw new Error('not found');
    },
  } as unknown as ModuleRef;
  const service = new PluginBleService(source, moduleRef);
  service.clock = clock;

  const host: HostBleHarness = {
    service,
    driver,
    readerDriver,
    readers,
    clock,
    reconnectReader: (readerId, reconnect) => {
      if (!reconnect?.halfOpen) dropReader(readerId);
      connectReader(readerId);
    },
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
      if (reader.available ?? true) connectReader(reader.readerId);
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
    setReaderAvailable: (readerId, available) => {
      driver.available.set(readerId, available);
      if (!available) dropReader(readerId);
      else if (!readers.has(readerId)) connectReader(readerId);
    },
    setReaderSupported: (readerId, supported, detail = 'no-ble-capability') => {
      if (supported) driver.unsupported.delete(readerId);
      else driver.unsupported.set(readerId, detail);
      const socket = readers.get(readerId)?.socket;
      if (socket) {
        socket.state.ble = supported ? parseBleCapability(FAKE_READER_BLE_CAPABILITY) : { supported: false, detail };
      }
    },
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
    setMtu: (mtu) => {
      driver.mtu = mtu;
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
