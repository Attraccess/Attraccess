import { Resource, SupervisionMode, User } from '@attraccess/database-entities';
import type {
  PluginActiveSession,
  PluginCanStartResult,
  PluginMaintenanceWindow,
  PluginResourceAccessContext,
} from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';
import type { ResourceIntroducersService } from '../../resources/introducers/resourceIntroducers.service';
import type { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import type { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import type { RbacService } from '../../users-and-auth/rbac/rbac.service';

const MAINTENANCE_MANAGE_PERMISSION = 'resources.maintenance.manage';
const LOOKUP_CONCURRENCY = 20;

/** Core services and lookups the plugin-facing access queries delegate to. */
export interface ResourceAccessDeps {
  usage: Pick<ResourceUsageService, 'canControllResource' | 'getActiveSessionsForResource'>;
  introducers: Pick<ResourceIntroducersService, 'canMaintain'>;
  maintenance: Pick<ResourceMaintenanceService, 'getMaintenanceManagedResourceIds' | 'findOverlappingMaintenances'>;
  rbac: Pick<RbacService, 'getEffectivePermissions'>;
  findUser(userId: number): Promise<User | null>;
  findResource(resourceId: number): Promise<Pick<Resource, 'id' | 'supervisionMode'> | null>;
  listResourceIds(): Promise<number[]>;
}

/** Plugin-facing, read-only facade over core authorization. Holds no logic of its own beyond composition. */
export function createResourceAccessContext(getDeps: () => ResourceAccessDeps): PluginResourceAccessContext {
  const hasPermission = async (userId: number, permission: string): Promise<boolean> =>
    (await getDeps().rbac.getEffectivePermissions(userId)).has(permission);

  return {
    async canStart(userId, resourceId): Promise<PluginCanStartResult> {
      const deps = getDeps();
      const resource = await deps.findResource(resourceId);
      if (!resource) throw new NotFoundException(`Resource with ID ${resourceId} not found`);
      const supervisionAllowed =
        resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
        resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;
      const user = await deps.findUser(userId);
      const canControl = user ? await deps.usage.canControllResource(resourceId, user) : false;
      // Same rules as the solo-start guard and the reader's requiresSupervisor flag.
      const requiresSupervision =
        resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED ||
        (resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED && !canControl);
      return {
        allowed: canControl && resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED,
        requiresSupervision: user ? requiresSupervision : false,
        supervisionAllowed: user ? supervisionAllowed : false,
      };
    },

    async canMaintain(userId, resourceId) {
      const deps = getDeps();
      return (
        (await hasPermission(userId, MAINTENANCE_MANAGE_PERMISSION)) ||
        (await deps.introducers.canMaintain(resourceId, userId, true))
      );
    },

    hasPermission,

    async listResourceIdsIntroduced(userId) {
      const deps = getDeps();
      const user = await deps.findUser(userId);
      if (!user) return [];
      const resourceIds = await deps.listResourceIds();
      const introduced: number[] = [];
      for (let offset = 0; offset < resourceIds.length; offset += LOOKUP_CONCURRENCY) {
        const chunk = resourceIds.slice(offset, offset + LOOKUP_CONCURRENCY);
        const results = await Promise.all(chunk.map((id) => deps.usage.canControllResource(id, user)));
        introduced.push(...chunk.filter((_, index) => results[index]));
      }
      return introduced;
    },

    async listResourceIdsMaintained(userId) {
      const deps = getDeps();
      const user = await deps.findUser(userId);
      if (!user) return [];
      const resourceIds = await deps.listResourceIds();
      const maintained = await deps.maintenance.getMaintenanceManagedResourceIds(user, resourceIds);
      return resourceIds.filter((id) => maintained.has(id));
    },

    async getMaintenanceWindows(resourceId, from, to): Promise<PluginMaintenanceWindow[]> {
      const maintenances = await getDeps().maintenance.findOverlappingMaintenances(resourceId, from, to);
      return maintenances.map((maintenance) => ({
        maintenanceId: maintenance.id,
        resourceId: maintenance.resourceId,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime ?? null,
        reason: maintenance.reason ?? null,
      }));
    },

    async getActiveSessions(resourceId): Promise<PluginActiveSession[]> {
      const sessions = await getDeps().usage.getActiveSessionsForResource(resourceId);
      return sessions.map((session) => ({
        usageId: session.id,
        userId: session.userId,
        startTime: session.startTime,
      }));
    },
  };
}
