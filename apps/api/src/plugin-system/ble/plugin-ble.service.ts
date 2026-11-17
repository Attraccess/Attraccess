import type { PluginBleEndpointRecord, PluginBleReaderAccess } from '@attraccess/application-models';
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
import { BleSessionEngine, type BleSessionClock } from '@attraccess/plugins-backend-sdk/internal';
import { Inject, Injectable, Logger, LoggerService, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { classifyPersistenceError, isUniqueViolation } from '../../database/persistence-errors';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../attractap/events';
import { BLE_TRANSPORT_DRIVER, type BleTransportDriver } from './ble-transport-driver';
import { getPluginBleProfile } from './plugin-ble-profile-registry';
import { PLUGIN_BLE_STORE, type PluginBleStore } from './plugin-ble-store.port';

/** Who is calling: the plugin's stable manifest id and its scoped logger. */
export interface PluginBleCaller {
  pluginId: string;
  logger: LoggerService;
}

/** What a cleanup matches on: an open session, or an `openSession` call still checking reader and driver. */
interface SessionScope {
  pluginId: string;
  readerId: number;
  endpointId: string;
}

interface SessionEntry extends SessionScope {
  session: BleSessionEngine;
  address: string;
}

interface PendingOpen extends SessionScope {
  revoked: PluginBleCloseReason | null;
}

/** Host deadlines for driver calls that have no plugin-visible timeout of their own. */
const READER_AVAILABILITY_DEADLINE_MS = 5_000;
const SCAN_GRACE_MS = 5_000;

const realClock: BleSessionClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return () => clearTimeout(timer);
  },
};

function toEndpoint(row: PluginBleEndpointRecord): PluginBleEndpoint {
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

const isForeignKeyViolation = (error: unknown): boolean => classifyPersistenceError(error) === 'foreign-key-violation';

/**
 * Host side of `context.ble`: persisted endpoints, reader opt-in, ownership, profile enforcement and the session
 * lifecycle. It talks to readers only through the host-internal `BleTransportDriver` (ATT-1033).
 */
@Injectable()
export class PluginBleService implements OnModuleDestroy {
  private readonly logger = new Logger(PluginBleService.name);
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly pendingOpens = new Set<PendingOpen>();
  /** Serializes the address-conflict check with the write, so two plugins cannot bind one address at once. */
  private endpointWrites: Promise<unknown> = Promise.resolve();
  /** Overridable for tests. */
  public clock: BleSessionClock = realClock;

  constructor(
    @Inject(PLUGIN_BLE_STORE) private readonly store: PluginBleStore,
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
    await this.serializeEndpointWrite(() => this.store.deleteEndpointsOfPlugin(pluginId));
    await this.closeWhere((scope) => scope.pluginId === pluginId, 'endpoint-deleted');
  }

  // The event bus is shared with plugins (EMIT_EVENTS), so the database decides, not the event payload.
  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  async onReaderUpdated(event: ReaderUpdatedEvent): Promise<void> {
    if (event.reader?.allowPluginBle !== false) return;
    const reader = await this.findReader(event.reader.id);
    if (!reader?.allowPluginBle) await this.revokeReader(event.reader.id);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  async onReaderDeleted(event: ReaderDeletedEvent): Promise<void> {
    if (!(await this.findReader(event.readerId))) await this.revokeReader(event.readerId);
  }

  /** Closes every session through the reader. Endpoint rows stay (opt-out) or are cascaded away (deletion). */
  revokeReader(readerId: number): Promise<void> {
    return this.closeWhere((entry) => entry.readerId === readerId, 'reader-access-revoked');
  }

  /** Closes matching sessions and makes matching `openSession` calls that are still in flight fail. */
  private async closeWhere(predicate: (scope: SessionScope) => boolean, reason: PluginBleCloseReason): Promise<void> {
    for (const pending of this.pendingOpens) if (predicate(pending)) pending.revoked ??= reason;
    await Promise.all([...this.sessions.values()].filter(predicate).map((entry) => entry.session.close(reason)));
  }

  // ------------------------------------------------------------- readers

  async listReaders(): Promise<PluginBleReader[]> {
    const driver = this.driver();
    const readers = await this.store.listOpenReaders();
    return Promise.all(
      readers.map(async (reader) => ({
        readerId: reader.id,
        name: reader.name,
        available: driver ? await this.isReaderAvailable(driver, reader.id).catch(() => false) : false,
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

    const startedAt = this.clock.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    // Core owns the deadline: a transport that does not answer in time is aborted.
    let timedOut = false;
    const cancelDeadline = this.clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, durationMs + SCAN_GRACE_MS);
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
            () =>
              reject(
                timedOut
                  ? new PluginBleError('TIMEOUT', 'scan timed out', { operation: 'scan' })
                  : new PluginBleError('CANCELLED', 'scan was cancelled', { operation: 'scan' }),
              ),
            { once: true },
          ),
        ),
      ]);
      // The driver is not trusted to filter: core applies the profile filter again and skips malformed entries.
      const matches: PluginBleAdvertisement[] = [];
      for (const entry of Array.isArray(raw) ? raw : []) {
        const advertisement = this.tryNormalizeAdvertisement(entry);
        if (advertisement && matchesBleAdvertisement(profile, advertisement)) matches.push(advertisement);
      }
      caller.logger.debug?.(
        `ble scan reader=${readerId} profile=${profile.id} ok results=${matches.length} ${this.clock.now() - startedAt}ms`,
      );
      return matches;
    } finally {
      cancelDeadline();
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  // ----------------------------------------------------------- endpoints

  async createEndpoint(caller: PluginBleCaller, input: PluginBleEndpointInput): Promise<PluginBleEndpoint> {
    const normalized = normalizeBleEndpointInput(input);
    this.requireProfile(caller.pluginId, normalized.profileId);
    await this.requireReader(normalized.readerId);
    const row = await this.serializeEndpointWrite(async () => {
      await this.assertNoConflict(caller.pluginId, normalized.readerId, normalized.address);
      return this.writeEndpoint(normalized.readerId, () =>
        this.store.createEndpoint({ id: randomUUID(), pluginId: caller.pluginId, ...normalized }),
      );
    });
    return toEndpoint(row);
  }

  async getEndpoint(caller: PluginBleCaller, id: string): Promise<PluginBleEndpoint> {
    return toEndpoint(await this.findOwned(caller.pluginId, id));
  }

  async listEndpoints(caller: PluginBleCaller): Promise<PluginBleEndpoint[]> {
    const rows = await this.store.listEndpoints(caller.pluginId);
    return rows.map(toEndpoint);
  }

  async updateEndpoint(
    caller: PluginBleCaller,
    id: string,
    update: PluginBleEndpointUpdate,
  ): Promise<PluginBleEndpoint> {
    await this.findOwned(caller.pluginId, id);
    const changes = normalizeBleEndpointUpdate(update);
    if (changes.readerId !== undefined) await this.requireReader(changes.readerId);
    const { row, moved } = await this.serializeEndpointWrite(async () => {
      const current = await this.findOwned(caller.pluginId, id);
      const readerId = changes.readerId ?? current.readerId;
      const address = changes.address ?? current.address;
      await this.assertNoConflict(caller.pluginId, readerId, address, current.id);
      const hasMoved =
        readerId !== current.readerId ||
        address !== current.address ||
        (changes.addressType ?? current.addressType) !== current.addressType;
      const saved = await this.writeEndpoint(readerId, () => this.store.updateEndpoint(current.id, changes));
      // Deleted between the ownership check and the write: the endpoint is gone.
      if (!saved) throw this.endpointNotFound();
      return { row: saved, moved: hasMoved };
    });
    // Saved first: an open that read the old row is still pending and gets revoked here, a later one sees the new row.
    if (moved) await this.closeWhere((scope) => scope.endpointId === row.id, 'endpoint-deleted');
    return toEndpoint(row);
  }

  async deleteEndpoint(caller: PluginBleCaller, id: string): Promise<void> {
    const row = await this.findOwned(caller.pluginId, id);
    // Serialized with updates, so a concurrent update cannot re-insert the row it read before the delete.
    await this.serializeEndpointWrite(() => this.store.deleteEndpoint(row.id));
    await this.closeWhere((scope) => scope.endpointId === row.id, 'endpoint-deleted');
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
    const scope: SessionScope = { pluginId: caller.pluginId, readerId: endpoint.readerId, endpointId: endpoint.id };
    // Cleanups that run while the reader and driver are checked must still reach this call.
    const pending: PendingOpen = { ...scope, revoked: null };
    this.pendingOpens.add(pending);
    let driver: BleTransportDriver;
    try {
      await this.requireReader(endpoint.readerId);
      driver = await this.requireAvailableDriver(endpoint.readerId);
    } finally {
      this.pendingOpens.delete(pending);
    }
    if (pending.revoked) throw this.revokedError(pending.revoked);
    // No await between this check and the registration below: two concurrent opens cannot both pass.
    if (this.sessions.has(endpoint.id)) {
      throw new PluginBleError('ENDPOINT_BUSY', 'The endpoint already has an open session', { detail: endpoint.id });
    }
    const session: BleSessionEngine = new BleSessionEngine({
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
    this.sessions.set(endpoint.id, { session, ...scope, address: endpoint.address });
    await session.open({ signal: options?.signal, ...resolved });
    return session.handle;
  }

  /** Ids of the currently open sessions (diagnostics and tests). */
  listOpenSessions(): Array<Omit<SessionEntry, 'session'> & { sessionId: string }> {
    return [...this.sessions.values()].map(({ session, ...scope }) => ({ ...scope, sessionId: session.id }));
  }

  // ------------------------------------------------------------- helpers

  private driver(): BleTransportDriver | undefined {
    try {
      return this.moduleRef.get<BleTransportDriver>(BLE_TRANSPORT_DRIVER, { strict: false }) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private isReaderAvailable(driver: BleTransportDriver, readerId: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const cancel = this.clock.setTimeout(
        () => reject(new PluginBleError('TIMEOUT', 'The transport did not report reader availability in time')),
        READER_AVAILABILITY_DEADLINE_MS,
      );
      Promise.resolve()
        .then(() => driver.isReaderAvailable(readerId))
        .then(
          (available) => (cancel(), resolve(Boolean(available))),
          (error) => (cancel(), reject(error)),
        );
    });
  }

  private tryNormalizeAdvertisement(entry: unknown): PluginBleAdvertisement | null {
    try {
      return normalizeBleAdvertisement(entry as PluginBleAdvertisement);
    } catch {
      return null;
    }
  }

  private revokedError(reason: PluginBleCloseReason): PluginBleError {
    if (reason === 'reader-access-revoked') {
      return new PluginBleError('READER_ACCESS_DENIED', 'Reader access was revoked', { detail: 'readerId' });
    }
    if (reason === 'endpoint-deleted') {
      return new PluginBleError('ENDPOINT_NOT_FOUND', 'Endpoint not found', { detail: 'endpointId' });
    }
    return new PluginBleError('SESSION_CLOSED', 'The session was closed while opening', { detail: reason });
  }

  private serializeEndpointWrite<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.endpointWrites.then(fn);
    this.endpointWrites = result.catch(() => undefined);
    return result;
  }

  private async writeEndpoint<T>(readerId: number, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) throw this.conflict();
      // The reader was deleted between the reader check and the write.
      if (isForeignKeyViolation(error)) {
        throw new PluginBleError('READER_NOT_FOUND', `Reader ${readerId} does not exist`, { detail: 'readerId' });
      }
      throw error;
    }
  }

  private endpointNotFound(): PluginBleError {
    return new PluginBleError('ENDPOINT_NOT_FOUND', 'Endpoint not found', { detail: 'endpointId' });
  }

  private async requireAvailableDriver(readerId: number): Promise<BleTransportDriver> {
    const driver = this.driver();
    if (!driver) throw new PluginBleError('TRANSPORT_UNAVAILABLE', 'No BLE transport is available on this host');
    if (!(await this.isReaderAvailable(driver, readerId))) {
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

  private findReader(readerId: number): Promise<PluginBleReaderAccess | null> {
    return this.store.findReader(readerId);
  }

  private async requireReader(readerId: number): Promise<void> {
    const reader = await this.findReader(readerId);
    if (!reader)
      throw new PluginBleError('READER_NOT_FOUND', `Reader ${readerId} does not exist`, { detail: 'readerId' });
    if (!reader.allowPluginBle) {
      throw new PluginBleError('READER_ACCESS_DENIED', `Reader ${readerId} is not open for plugins`, {
        detail: 'readerId',
      });
    }
  }

  /** Another plugin's endpoint is indistinguishable from a missing one. */
  private async findOwned(pluginId: string, id: unknown): Promise<PluginBleEndpointRecord> {
    const row = await this.store.findEndpoint(pluginId, validateBleEndpointId(id));
    if (!row) throw this.endpointNotFound();
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
    const rows = await this.store.listEndpointsAtAddress(address);
    for (const other of rows) {
      if (other.id === ignoreId) continue;
      if (other.pluginId !== pluginId || other.readerId === readerId) throw this.conflict();
    }
  }
}
