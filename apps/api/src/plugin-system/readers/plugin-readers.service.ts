import type { PluginReaderRecord, PluginReaderRecordChanges, ResourceType } from '@attraccess/application-models';
import {
  PLUGIN_READER_LIMITS,
  PluginReader,
  PluginReaderCapabilities,
  PluginReaderError,
  PluginReaderTapFailureReason,
  PluginReaderTapResult,
} from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AUDIT_RECORDER, AuditDetails, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../audit/recorder/audit-event';
import { ResourceIntroductionRequiredException } from '../../exceptions/resource.introduction.required.exception';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUnhealthyException } from '../../exceptions/resource.unhealthy.exception';
import {
  ReaderAction,
  ReaderCapabilities,
  allowedReaderActions,
  canAssign,
} from '../../resources/reader-capabilities/reader-capabilities';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { PluginCardAuthentication, PluginCardAuthentications } from './plugin-card-authentications';
import { PLUGIN_READER_STORE, type PluginReaderStore } from './plugin-reader-store.port';

/** Validated input of a register or update; the context checks the plugin's arguments. */
export interface PluginReaderChanges {
  name?: string;
  capabilities?: PluginReaderCapabilities;
}

type TapRefusal = Extract<PluginReaderTapResult, { ok: false }>;

const refusal = (reason: PluginReaderTapFailureReason): TapRefusal => ({ ok: false, reason });

const coreCapabilities = (capabilities: PluginReaderCapabilities): ReaderCapabilities => ({
  resourceTypes: capabilities.resourceTypes as ResourceType[],
  actions: capabilities.actions as ReaderAction[],
});

function toReader(row: PluginReaderRecord): PluginReader {
  return {
    deviceId: row.deviceId,
    name: row.name,
    capabilities: {
      resourceTypes: [...row.capabilities.resourceTypes],
      actions: [...row.capabilities.actions],
    } as PluginReaderCapabilities,
    resourceId: row.resourceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Why the door action refused the card owner, or null for a host failure. The gate's exception types decide,
 * never their messages; any other refusal of the action means the resource changed since the reader's check.
 */
function gateRefusal(error: unknown): PluginReaderTapFailureReason | null {
  if (error instanceof ResourceUsageImpossibleMaintenanceInProgressException) return 'MAINTENANCE';
  if (error instanceof ResourceUnhealthyException) return 'MAINTENANCE';
  if (error instanceof ResourceIntroductionRequiredException) return 'ACCESS_DENIED';
  if (error instanceof ResourceNotFoundException) return 'NO_RESOURCE';
  if (error instanceof BadRequestException) return 'ACTION_NOT_ALLOWED';
  return null;
}

/**
 * Host side of `context.readers`: the plugin's readers, their assignment, and taps. A tap runs the same door
 * action as an Attractap reader (`ResourceUsageService.openDoor`), so maintenance, permission, usage record,
 * events and flows are the core's. Every tap with a known reader is audited; a handle is never logged.
 */
@Injectable()
export class PluginReadersService {
  private readonly logger = new Logger(PluginReadersService.name);
  /** Readers with a tap running, by plugin and device id. */
  private readonly tapping = new Set<string>();
  /** Serializes the writes, so the reader limit and the upsert hold under concurrent calls. */
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(PLUGIN_READER_STORE) private readonly store: PluginReaderStore,
    private readonly moduleRef: ModuleRef,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly authentications: PluginCardAuthentications,
  ) {}

  private findReader(pluginId: string, deviceId: string): Promise<PluginReaderRecord | null> {
    return this.store.find(pluginId, deviceId);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.writes.then(work, work);
    this.writes = run.catch(() => undefined);
    return run;
  }

  private async requireReader(pluginId: string, deviceId: string): Promise<PluginReaderRecord> {
    const reader = await this.findReader(pluginId, deviceId);
    if (!reader) throw new PluginReaderError('READER_NOT_FOUND', `No reader with device id ${deviceId}`);
    return reader;
  }

  async register(pluginId: string, deviceId: string, changes: Required<PluginReaderChanges>): Promise<PluginReader> {
    return this.serialize(async () => {
      const existing = await this.findReader(pluginId, deviceId);
      if (existing) return this.applyChanges(existing, changes);
      if ((await this.store.count(pluginId)) >= PLUGIN_READER_LIMITS.maxReaders) {
        throw new PluginReaderError(
          'LIMIT_REACHED',
          `A plugin can register at most ${PLUGIN_READER_LIMITS.maxReaders} readers`,
        );
      }
      return toReader(await this.store.create({ pluginId, deviceId, ...changes }));
    });
  }

  async update(pluginId: string, deviceId: string, changes: PluginReaderChanges): Promise<PluginReader> {
    return this.serialize(async () => this.applyChanges(await this.requireReader(pluginId, deviceId), changes));
  }

  /** Narrowed capabilities that no longer allow the assigned resource unassign it. */
  private async applyChanges(reader: PluginReaderRecord, changes: PluginReaderChanges): Promise<PluginReader> {
    const patch: PluginReaderRecordChanges = {};
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.capabilities !== undefined) {
      patch.capabilities = changes.capabilities;
      if (reader.resourceId !== null) {
        const resource = await this.store.findResource(reader.resourceId);
        if (!resource || !canAssign(coreCapabilities(changes.capabilities), resource)) patch.resourceId = null;
      }
    }
    return toReader(await this.store.update(reader.id, patch));
  }

  async remove(pluginId: string, deviceId: string): Promise<void> {
    await this.serialize(() => this.store.delete(pluginId, deviceId));
  }

  async get(pluginId: string, deviceId: string): Promise<PluginReader | null> {
    const reader = await this.findReader(pluginId, deviceId);
    return reader ? toReader(reader) : null;
  }

  async list(pluginId: string): Promise<PluginReader[]> {
    return (await this.store.list(pluginId)).map(toReader);
  }

  async assignResource(pluginId: string, deviceId: string, resourceId: number): Promise<PluginReader> {
    return this.serialize(async () => {
      const reader = await this.requireReader(pluginId, deviceId);
      const resource = await this.store.findResource(resourceId);
      if (!resource) throw new PluginReaderError('RESOURCE_NOT_FOUND', `No resource with id ${resourceId}`);
      if (!canAssign(coreCapabilities(reader.capabilities as PluginReaderCapabilities), resource)) {
        throw new PluginReaderError(
          'RESOURCE_NOT_ALLOWED',
          `The reader's capabilities do not allow resource ${resourceId}`,
        );
      }
      return toReader(await this.store.update(reader.id, { resourceId }));
    });
  }

  async unassignResource(pluginId: string, deviceId: string): Promise<PluginReader> {
    return this.serialize(async () => {
      const reader = await this.requireReader(pluginId, deviceId);
      return toReader(reader.resourceId === null ? reader : await this.store.update(reader.id, { resourceId: null }));
    });
  }

  /** Uninstall: the plugin's readers and their assignments go. Disabling keeps them. */
  async deleteAllForPlugin(pluginId: string): Promise<void> {
    await this.serialize(() => this.store.deleteAllOfPlugin(pluginId));
  }

  /** Consumes the handle first, so it is spent on every outcome. */
  async tap(pluginId: string, deviceId: string, handle: string): Promise<PluginReaderTapResult> {
    const consumed = this.authentications.consume(handle);
    const card = consumed?.pluginId === pluginId && consumed.device === deviceId ? consumed : null;
    const key = `${pluginId}\u0000${deviceId}`;
    let reason: PluginReaderTapFailureReason;
    if (!card) reason = 'AUTHENTICATION_INVALID';
    else if (this.authentications.isExpired(card)) reason = 'AUTHENTICATION_EXPIRED';
    else if (this.tapping.has(key)) reason = 'BUSY';
    else {
      this.tapping.add(key);
      try {
        return await this.runTap(pluginId, deviceId, card);
      } finally {
        this.tapping.delete(key);
      }
    }
    return this.finishTap(pluginId, await this.findReader(pluginId, deviceId), card, refusal(reason));
  }

  private async runTap(
    pluginId: string,
    deviceId: string,
    card: PluginCardAuthentication,
  ): Promise<PluginReaderTapResult> {
    const reader = await this.findReader(pluginId, deviceId);
    const refuse = (reason: PluginReaderTapFailureReason) => this.finishTap(pluginId, reader, card, refusal(reason));
    if (!reader) return refuse('READER_NOT_FOUND');
    const resource = reader.resourceId === null ? null : await this.store.findResource(reader.resourceId);
    if (!resource) return refuse('NO_RESOURCE');
    const [action] = allowedReaderActions(coreCapabilities(reader.capabilities as PluginReaderCapabilities), resource);
    if (action !== 'open') return refuse('ACTION_NOT_ALLOWED');
    // A deleted user is not found (soft delete); a disabled one may not act.
    const user = await this.store.findCardOwner(card.userId);
    if (!user || user.isDisabled) return refuse('ACCESS_DENIED');
    try {
      await this.moduleRef
        .get(ResourceUsageService, { strict: false })
        .openDoor(resource.id, { id: user.id, username: user.username });
    } catch (error) {
      const reason = gateRefusal(error);
      if (!reason) throw error;
      return refuse(reason);
    }
    return this.finishTap(pluginId, reader, card, { ok: true, action, resourceId: resource.id, userId: user.id });
  }

  /** Audits the tap and returns its result. A tap on an unknown reader has no subject to audit. */
  private async finishTap(
    pluginId: string,
    reader: PluginReaderRecord | null,
    card: PluginCardAuthentication | null,
    result: PluginReaderTapResult,
  ): Promise<PluginReaderTapResult> {
    if (!reader) {
      this.logger.warn(`Plugin ${pluginId} tapped a reader it has not registered`);
      return result;
    }
    const details: AuditDetails = {
      pluginId,
      deviceId: reader.deviceId,
      subjectLabel: reader.name,
      result: result.ok ? 'accepted' : 'refused',
    };
    const resourceId = result.ok ? result.resourceId : reader.resourceId;
    if (resourceId !== null) details.resourceId = resourceId;
    if (card) {
      details.cardId = card.cardId;
      details.userId = card.userId;
    }
    if ('reason' in result) details.reasonCode = result.reason;
    try {
      await this.audit.record({
        domain: 'attractap',
        action: 'attractap.plugin_reader.tapped',
        actor: SYSTEM_AUDIT_ACTOR,
        subject: { type: 'attractap.plugin-reader', id: reader.id },
        details,
      });
    } catch (error) {
      this.logger.warn(`Auditing a tap on plugin reader ${reader.id} failed: ${(error as Error).message}`);
    }
    return result;
  }
}
