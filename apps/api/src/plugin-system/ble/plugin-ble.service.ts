import { Attractap, PluginBleEndpointEntity } from '@attraccess/database-entities';
import {
  matchesBleAdvertisement,
  normalizeBleAdvertisement,
  normalizeBleEndpointInput,
  normalizeBleEndpointUpdate,
  PluginBleError,
  resolveBleScanDuration,
  resolveBleSessionOptions,
  validateBleEndpointId,
  validateBleProfileId,
  validateBleReaderId,
  type PluginBleAdvertisement,
  type PluginBleCloseReason,
  type PluginBleEndpoint,
  type PluginBleEndpointInput,
  type PluginBleEndpointUpdate,
  type PluginBleProfile,
  type PluginBleReader,
  type PluginBleScanOptions,
  type PluginBleSession,
  type PluginBleSessionOptions,
} from '@attraccess/plugins-backend-sdk';
import { Injectable, Logger, LoggerService, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../attractap/events';
import { BLE_TRANSPORT_DRIVER, type BleTransportDriver } from './ble-transport-driver';
import { BleSession, type BleSessionClock } from './plugin-ble-session';
import { getPluginBleProfile } from './plugin-ble-profile-registry';

/** Who is calling: the plugin's stable manifest id and its scoped logger. */
export interface PluginBleCaller {
  pluginId: string;
  logger: LoggerService;
}

interface SessionEntry {
  session: BleSession;
  pluginId: string;
  readerId: number;
  address: string;
}

const realClock: BleSessionClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return () => clearTimeout(timer);
  },
};

function toEndpoint(row: PluginBleEndpointEntity): PluginBleEndpoint {
  return {
    id: row.id,
    readerId: row.readerId,
    address: row.address,
    addressType: row.addressType,
    profileId: row.profileId,
    label: row.label ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const text = `${(error as { code?: string })?.code ?? ''} ${(error as Error)?.message ?? ''}`;
  return /SQLITE_CONSTRAINT|UNIQUE constraint/i.test(text);
}

/**
 * Host side of `context.ble`: persisted endpoints, reader opt-in, ownership, profile enforcement and the session
 * lifecycle. It talks to readers only through the host-internal `BleTransportDriver` (ATT-1033).
 */
@Injectable()
export class PluginBleService implements OnModuleDestroy {
  private readonly logger = new Logger(PluginBleService.name);
  private readonly sessions = new Map<string, SessionEntry>();
  /** Overridable for tests. */
  public clock: BleSessionClock = realClock;

  constructor(
    private readonly dataSource: DataSource,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.closeWhere(() => true, 'shutdown');
  }

  // -------------------------------------------------------------- cleanup

  /** The plugin module is destroyed: its sessions end, its endpoints stay. */
  closePluginSessions(pluginId: string, reason: PluginBleCloseReason = 'shutdown'): Promise<void> {
    return this.closeWhere((entry) => entry.pluginId === pluginId, reason);
  }

  /** Plugin uninstall: closes sessions and deletes every endpoint the plugin owns. */
  async deleteAllForPlugin(pluginId: string): Promise<void> {
    await this.closeWhere((entry) => entry.pluginId === pluginId, 'endpoint-deleted');
    await this.endpoints().delete({ pluginId });
  }

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  async onReaderUpdated(event: ReaderUpdatedEvent): Promise<void> {
    if (event.reader.allowPluginBle === false) await this.revokeReader(event.reader.id);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  async onReaderDeleted(event: ReaderDeletedEvent): Promise<void> {
    await this.revokeReader(event.readerId);
  }

  /** Closes every session through the reader. Endpoint rows stay (opt-out) or are cascaded away (deletion). */
  revokeReader(readerId: number): Promise<void> {
    return this.closeWhere((entry) => entry.readerId === readerId, 'reader-access-revoked');
  }

  private async closeWhere(predicate: (entry: SessionEntry) => boolean, reason: PluginBleCloseReason): Promise<void> {
    await Promise.all([...this.sessions.values()].filter(predicate).map((entry) => entry.session.close(reason)));
  }

  // ------------------------------------------------------------- readers

  async listReaders(): Promise<PluginBleReader[]> {
    const driver = this.driver();
    const readers = await this.dataSource
      .getRepository(Attractap)
      .find({ where: { allowPluginBle: true }, select: { id: true, name: true }, order: { id: 'ASC' } });
    return Promise.all(
      readers.map(async (reader) => ({
        readerId: reader.id,
        name: reader.name,
        available: driver ? Boolean(await driver.isReaderAvailable(reader.id)) : false,
      })),
    );
  }

  async scan(
    caller: PluginBleCaller,
    readerId: number,
    profileId: string,
    options?: PluginBleScanOptions,
  ): Promise<PluginBleAdvertisement[]> {
    validateBleReaderId(readerId);
    const profile = this.requireProfile(caller.pluginId, validateBleProfileId(profileId));
    const durationMs = resolveBleScanDuration(options?.durationMs);
    const filter = profile.advertisement;
    if (!filter) {
      throw new PluginBleError('OPERATION_NOT_ALLOWED', `Profile "${profile.id}" has no advertisement filter`, {
        operation: 'scan',
      });
    }
    await this.requireReader(readerId);
    const driver = await this.requireAvailableDriver(readerId);
    if (options?.signal?.aborted) throw new PluginBleError('CANCELLED', 'scan was cancelled', { operation: 'scan' });

    const startedAt = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const raw = await Promise.race([
        driver.scan({
          readerId,
          filter: {
            serviceUuids: [...filter.serviceUuids],
            manufacturerIds: [...filter.manufacturerIds],
            namePrefix: filter.namePrefix,
          },
          durationMs,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            'abort',
            () => reject(new PluginBleError('CANCELLED', 'scan was cancelled', { operation: 'scan' })),
            { once: true },
          ),
        ),
      ]);
      // The driver is not trusted to filter: core applies the profile filter again.
      const matches = raw
        .map(normalizeBleAdvertisement)
        .filter((advertisement) => matchesBleAdvertisement(profile, advertisement));
      caller.logger.debug?.(
        `ble scan reader=${readerId} profile=${profile.id} ok results=${matches.length} ${Date.now() - startedAt}ms`,
      );
      return matches;
    } finally {
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  // ----------------------------------------------------------- endpoints

  async createEndpoint(caller: PluginBleCaller, input: PluginBleEndpointInput): Promise<PluginBleEndpoint> {
    const normalized = normalizeBleEndpointInput(input);
    this.requireProfile(caller.pluginId, normalized.profileId);
    await this.requireReader(normalized.readerId);
    await this.assertNoConflict(caller.pluginId, normalized.readerId, normalized.address);
    try {
      const row = await this.endpoints().save(
        this.endpoints().create({ id: randomUUID(), pluginId: caller.pluginId, ...normalized }),
      );
      return toEndpoint((await this.endpoints().findOneBy({ id: row.id })) ?? row);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.conflict();
      throw error;
    }
  }

  async getEndpoint(caller: PluginBleCaller, id: string): Promise<PluginBleEndpoint> {
    return toEndpoint(await this.findOwned(caller.pluginId, id));
  }

  async listEndpoints(caller: PluginBleCaller): Promise<PluginBleEndpoint[]> {
    const rows = await this.endpoints().find({
      where: { pluginId: caller.pluginId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map(toEndpoint);
  }

  async updateEndpoint(
    caller: PluginBleCaller,
    id: string,
    update: PluginBleEndpointUpdate,
  ): Promise<PluginBleEndpoint> {
    const row = await this.findOwned(caller.pluginId, id);
    const changes = normalizeBleEndpointUpdate(update);
    const readerId = changes.readerId ?? row.readerId;
    const address = changes.address ?? row.address;
    if (changes.readerId !== undefined) await this.requireReader(readerId);
    await this.assertNoConflict(caller.pluginId, readerId, address, row.id);
    const moved =
      readerId !== row.readerId ||
      address !== row.address ||
      (changes.addressType ?? row.addressType) !== row.addressType;
    if (moved) await this.closeWhere((entry) => entry.session.endpointId === row.id, 'endpoint-deleted');
    Object.assign(row, changes);
    try {
      await this.endpoints().save(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.conflict();
      throw error;
    }
    return toEndpoint((await this.endpoints().findOneBy({ id: row.id })) ?? row);
  }

  async deleteEndpoint(caller: PluginBleCaller, id: string): Promise<void> {
    const row = await this.findOwned(caller.pluginId, id);
    await this.closeWhere((entry) => entry.session.endpointId === row.id, 'endpoint-deleted');
    await this.endpoints().delete({ id: row.id });
  }

  // ------------------------------------------------------------ sessions

  async openSession(
    caller: PluginBleCaller,
    endpointId: string,
    options?: PluginBleSessionOptions,
  ): Promise<PluginBleSession> {
    const endpoint = await this.findOwned(caller.pluginId, endpointId);
    const profile = this.requireProfile(caller.pluginId, endpoint.profileId);
    const resolved = resolveBleSessionOptions(profile, options);
    if (options?.signal?.aborted)
      throw new PluginBleError('CANCELLED', 'openSession was cancelled', { operation: 'openSession' });
    await this.requireReader(endpoint.readerId);
    const driver = await this.requireAvailableDriver(endpoint.readerId);
    // No await between this check and the registration below: two concurrent opens cannot both pass.
    if (this.sessions.has(endpoint.id)) {
      throw new PluginBleError('ENDPOINT_BUSY', 'The endpoint already has an open session', { detail: endpoint.id });
    }
    const session: BleSession = new BleSession({
      id: randomUUID(),
      endpointId: endpoint.id,
      profile,
      clock: this.clock,
      connect: (signal, timeoutMs) =>
        driver.connect({
          readerId: endpoint.readerId,
          address: endpoint.address,
          addressType: endpoint.addressType,
          timeoutMs,
          signal,
        }),
      onClosed: () => {
        if (this.sessions.get(endpoint.id)?.session === session) this.sessions.delete(endpoint.id);
      },
      log: (operation, outcome, durationMs) =>
        caller.logger.debug?.(`ble ${operation} endpoint=${endpoint.id} ${outcome} ${durationMs}ms`),
    });
    this.sessions.set(endpoint.id, {
      session,
      pluginId: caller.pluginId,
      readerId: endpoint.readerId,
      address: endpoint.address,
    });
    await session.open({ signal: options?.signal, ...resolved });
    return session;
  }

  // ------------------------------------------------------------- helpers

  private endpoints() {
    return this.dataSource.getRepository(PluginBleEndpointEntity);
  }

  private driver(): BleTransportDriver | undefined {
    try {
      return this.moduleRef.get<BleTransportDriver>(BLE_TRANSPORT_DRIVER, { strict: false }) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async requireAvailableDriver(readerId: number): Promise<BleTransportDriver> {
    const driver = this.driver();
    if (!driver) throw new PluginBleError('TRANSPORT_UNAVAILABLE', 'No BLE transport is available on this host');
    if (!(await driver.isReaderAvailable(readerId))) {
      throw new PluginBleError('READER_OFFLINE', `Reader ${readerId} cannot do BLE right now`);
    }
    return driver;
  }

  private requireProfile(pluginId: string, profileId: string): PluginBleProfile {
    const profile = getPluginBleProfile(pluginId, profileId);
    if (!profile) {
      throw new PluginBleError('PROFILE_NOT_REGISTERED', `Profile "${profileId}" is not registered by this plugin`, {
        detail: profileId,
      });
    }
    return profile;
  }

  private async requireReader(readerId: number): Promise<void> {
    const reader = await this.dataSource
      .getRepository(Attractap)
      .findOne({ where: { id: readerId }, select: { id: true, allowPluginBle: true } });
    if (!reader)
      throw new PluginBleError('READER_NOT_FOUND', `Reader ${readerId} does not exist`, { detail: 'readerId' });
    if (!reader.allowPluginBle) {
      throw new PluginBleError('READER_ACCESS_DENIED', `Reader ${readerId} is not open for plugins`, {
        detail: 'readerId',
      });
    }
  }

  /** Another plugin's endpoint is indistinguishable from a missing one. */
  private async findOwned(pluginId: string, id: unknown): Promise<PluginBleEndpointEntity> {
    const row = await this.endpoints().findOneBy({ id: validateBleEndpointId(id), pluginId });
    if (!row) throw new PluginBleError('ENDPOINT_NOT_FOUND', 'Endpoint not found', { detail: 'endpointId' });
    return row;
  }

  private conflict(): PluginBleError {
    return new PluginBleError('ENDPOINT_CONFLICT', 'This device address is already bound', { detail: 'address' });
  }

  /** One address belongs to one plugin; one plugin binds it once per reader. */
  private async assertNoConflict(
    pluginId: string,
    readerId: number,
    address: string,
    ignoreId?: string,
  ): Promise<void> {
    const rows = await this.endpoints().find({
      where: { address },
      select: { id: true, pluginId: true, readerId: true },
    });
    for (const other of rows) {
      if (other.id === ignoreId) continue;
      if (other.pluginId !== pluginId || other.readerId === readerId) throw this.conflict();
    }
  }
}
