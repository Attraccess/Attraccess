// Manages resource health state tracking with mutable status and source lifecycle tracking
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { NotFoundException } from '@nestjs/common';
import { ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { ResourceAuditOrigin } from '../../audit/audit-policy';
import type { ResourceHealthService } from './resource-health.service';

interface ResourceHealthServiceResourceHealthClearContext {
  healthRepository: ResourceHealthService['healthRepository'];
  audit: ResourceHealthService['audit'];
  logger: ResourceHealthService['logger'];
  eventEmitter: ResourceHealthService['eventEmitter'];
}
export async function clearEntry(
  context: ResourceHealthServiceResourceHealthClearContext,
  resourceId: number,
  entryId: number,
  auditOrigin: ResourceAuditOrigin = {
    actorId: null,
  },
): Promise<void> {
  const entry = await context.healthRepository.findOne({
    where: { id: entryId, resourceId },
  });
  if (!entry) {
    throw new NotFoundException(`Health entry ${entryId} not found for resource ${resourceId}`);
  }

  await context.healthRepository.remove(entry);

  if (entry.status === ResourceHealthStatus.UNHEALTHY) {
    await context.audit
      .recordResource({
        action: 'health.transition',
        ...auditOrigin,
        subjectId: resourceId,
        details: {
          previousStatus: entry.status,
          status: ResourceHealthStatus.HEALTHY,
          healthSource: entry.source,
        },
      })
      .catch(() => undefined);
    context.logger.log(
      `Resource ${resourceId} health entry cleared (identifier="${entry.identifier}"): ${entry.status} -> cleared`,
    );
    context.eventEmitter.emit(
      ResourceHealthChangedEvent.EVENT_NAME,
      new ResourceHealthChangedEvent(resourceId, entry.identifier, ResourceHealthStatus.HEALTHY, null, entry.status),
    );
  }
}
