// Manages resource health state tracking with mutable status and source lifecycle tracking
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { Resource, ResourceHealthState, ResourceHealthStatus } from '@attraccess/database-entities';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ResourceAuditOrigin } from '../../audit/audit-policy';
import { AuditService } from '../../audit/audit.service';
import { ResourceHealthSummaryDto } from './dtos/resource-health-state.dto';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { clearEntry as clearEntryImplementation } from './resource-health-clear';
import { ReportInput } from './resource-health.service.definitions';

@Injectable()
export class ResourceHealthService {
  private readonly logger = new Logger(ResourceHealthService.name);

  constructor(
    @InjectRepository(ResourceHealthState)
    private readonly healthRepository: Repository<ResourceHealthState>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
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

  async reportHealth(input: ReportInput): Promise<ResourceHealthState> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const reason = this.normalizeReason(input.status, input.reason);
    const reportedAt = input.reportedAt ?? new Date();

    const existing = await this.healthRepository.findOne({
      where: { resourceId: input.resourceId, identifier },
    });

    const previousStatus = existing?.status ?? null;

    let saved: ResourceHealthState;
    if (existing) {
      existing.status = input.status;
      existing.reason = reason;
      existing.source = input.source;
      existing.lastReportedAt = reportedAt;
      saved = await this.healthRepository.save(existing);
    } else {
      const created = this.healthRepository.create({
        resourceId: input.resourceId,
        identifier,
        status: input.status,
        reason,
        source: input.source,
        lastReportedAt: reportedAt,
      });
      saved = await this.healthRepository.save(created);
    }

    if (previousStatus !== input.status) {
      await this.audit
        .recordResource({
          action: 'health.transition',
          ...(input.auditOrigin ?? { actorId: null }),
          subjectId: input.resourceId,
          details: {
            previousStatus: previousStatus ?? 'none',
            status: input.status,
            healthSource: input.source,
          },
        })
        .catch(() => undefined);
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

  async listForResource(resourceId: number): Promise<ResourceHealthState[]> {
    return await this.healthRepository.find({
      where: { resourceId },
      order: { identifier: 'ASC' },
    });
  }

  async listForResources(resourceIds: number[]): Promise<Map<number, ResourceHealthState[]>> {
    const map = new Map<number, ResourceHealthState[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const entries = await this.healthRepository.find({
      where: { resourceId: In(resourceIds) },
      order: { identifier: 'ASC' },
    });
    for (const entry of entries) {
      const bucket = map.get(entry.resourceId);
      if (bucket) bucket.push(entry);
    }
    return map;
  }

  async getSummary(resourceId: number): Promise<ResourceHealthSummaryDto> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
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

  async isResourceUnhealthy(resourceId: number): Promise<boolean> {
    const count = await this.healthRepository.count({
      where: { resourceId, status: ResourceHealthStatus.UNHEALTHY },
    });
    return count > 0;
  }

  async clearEntry(
    resourceId: number,
    entryId: number,
    auditOrigin: ResourceAuditOrigin = {
      actorId: null,
    },
  ): Promise<void> {
    const getContextOwner = () => this;
    return clearEntryImplementation(
      {
        healthRepository: getContextOwner().healthRepository,
        audit: getContextOwner().audit,
        logger: getContextOwner().logger,
        eventEmitter: getContextOwner().eventEmitter,
      },
      resourceId,
      entryId,
      auditOrigin,
    );
  }

  private toDto(entry: ResourceHealthState) {
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

export { ReportInput } from './resource-health.service.definitions';
