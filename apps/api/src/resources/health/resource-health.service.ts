// Manages resource health state tracking with mutable status and source lifecycle tracking
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { ResourceHealthSource, ResourceHealthStatus, type ResourceHealthRecord } from '@attraccess/application-models';

import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditActor } from '../../audit/recorder/audit-event';

import { AUDIT_RECORDER, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../audit/recorder/audit-event';

import { ResourceHealthSummaryDto } from './dtos/resource-health-state.dto';

import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';

import { clearEntry as clearEntryImplementation } from './resource-health-clear';

import { RESOURCE_HEALTH_STORE, type ResourceHealthStore } from './resource-health-store.port';

import type { ResourcePersistenceContext } from '../resource-persistence-context';

/** Identifiers under this prefix (`plugin:<name>:<key>`) belong to plugins: only reports of source `plugin` write them. */
export const PLUGIN_HEALTH_IDENTIFIER_PREFIX = 'plugin:';

export interface ReportInput {
  resourceId: number;
  identifier?: string | null;
  status: ResourceHealthStatus;
  reason?: string | null;
  source: ResourceHealthSource;
  reportedAt?: Date;
  auditOrigin?: AuditActor;
}

@Injectable()
export class ResourceHealthService {
  private readonly logger = new Logger(ResourceHealthService.name);

  constructor(
    @Inject(RESOURCE_HEALTH_STORE)
    private readonly store: ResourceHealthStore,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  private normalizeIdentifier(identifier?: string | null): string {
    return (identifier ?? '').trim();
  }

  private normalizeReason(status: ResourceHealthStatus, reason?: string | null): string | null {
    if (status === ResourceHealthStatus.HEALTHY) {
      return null;
    }
    const trimmed = (reason ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Upserts the entry. Returns null for a report refused because it crosses the plugin namespace: a plugin writes only
   * `plugin:` identifiers, and nothing else writes them, so a flow or payload never takes over a plugin's entry.
   */
  async reportHealth(input: ReportInput): Promise<ResourceHealthRecord | null> {
    const identifier = this.normalizeIdentifier(input.identifier);
    if ((input.source === ResourceHealthSource.PLUGIN) !== identifier.startsWith(PLUGIN_HEALTH_IDENTIFIER_PREFIX)) {
      this.logger.warn(
        `Ignored a ${input.source} health report for "${identifier}" on resource ${input.resourceId}: identifiers ` +
          `starting with "${PLUGIN_HEALTH_IDENTIFIER_PREFIX}" belong to plugins.`,
      );
      return null;
    }
    const reason = this.normalizeReason(input.status, input.reason);
    const reportedAt = input.reportedAt ?? new Date();

    const { record: saved, previousStatus } = await this.store.upsertReport({
      resourceId: input.resourceId,
      identifier,
      status: input.status,
      reason,
      source: input.source,
      lastReportedAt: reportedAt,
    });

    if (previousStatus !== input.status) {
      await this.audit.record({
        domain: 'resource',
        action: 'health.transition',
        actor: input.auditOrigin ?? SYSTEM_AUDIT_ACTOR,
        subject: { type: 'resource', id: input.resourceId },
        details: {
          previousStatus: previousStatus ?? 'none',
          status: input.status,
          healthSource: input.source,
        },
      });
      this.logger.log(
        `Resource ${input.resourceId} health changed (identifier="${identifier}"): ${
          previousStatus ?? 'none'
        } -> ${input.status}${reason ? ` (${reason})` : ''}`,
      );
      this.eventEmitter.emit(
        ResourceHealthChangedEvent.EVENT_NAME,
        new ResourceHealthChangedEvent(input.resourceId, identifier, input.status, reason, previousStatus),
      );
    }

    return saved;
  }

  async listForResource(resourceId: number): Promise<ResourceHealthRecord[]> {
    return await this.store.listForResource(resourceId);
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return this.store.resourceExists(resourceId);
  }

  /** Entries of one source whose identifier starts with the prefix. */
  async listBySourceAndPrefix(
    source: ResourceHealthSource,
    identifierPrefix: string,
    resourceId?: number,
  ): Promise<ResourceHealthRecord[]> {
    return this.store.listBySourceAndPrefix(source, identifierPrefix, resourceId);
  }

  async listForResources(resourceIds: number[]): Promise<Map<number, ResourceHealthRecord[]>> {
    const map = new Map<number, ResourceHealthRecord[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    for (const entry of await this.store.listForResources(resourceIds)) {
      const bucket = map.get(entry.resourceId);
      if (bucket) bucket.push(entry);
    }
    return map;
  }

  async getSummary(resourceId: number): Promise<ResourceHealthSummaryDto> {
    if (!(await this.store.resourceExists(resourceId))) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const entries = await this.listForResource(resourceId);
    const unhealthyEntries = entries.filter((entry) => entry.status === ResourceHealthStatus.UNHEALTHY);

    return {
      resourceId,
      isHealthy: unhealthyEntries.length === 0,
      entries: entries.map((entry) => this.toDto(entry)),
      unhealthyEntries: unhealthyEntries.map((entry) => this.toDto(entry)),
    };
  }

  /** Pass the caller's transaction inside a serialized transaction: the main connection may wait for its lock. */
  async isResourceUnhealthy(resourceId: number, context?: ResourcePersistenceContext): Promise<boolean> {
    return this.store.hasUnhealthyEntry(resourceId, context);
  }

  async clearEntry(resourceId: number, entryId: number, auditOrigin: AuditActor = SYSTEM_AUDIT_ACTOR): Promise<void> {
    const getContextOwner = () => this;
    return clearEntryImplementation(
      {
        store: getContextOwner().store,
        audit: getContextOwner().audit,
        logger: getContextOwner().logger,
        eventEmitter: getContextOwner().eventEmitter,
      },
      resourceId,
      entryId,
      auditOrigin,
    );
  }

  private toDto(entry: ResourceHealthRecord) {
    return {
      id: entry.id,
      resourceId: entry.resourceId,
      identifier: entry.identifier,
      status: entry.status,
      reason: entry.reason,
      source: entry.source,
      lastReportedAt:
        entry.lastReportedAt instanceof Date
          ? entry.lastReportedAt.toISOString()
          : new Date(entry.lastReportedAt).toISOString(),
    };
  }
}
