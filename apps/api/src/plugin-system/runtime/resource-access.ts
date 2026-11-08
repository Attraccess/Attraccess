import { Resource, SupervisionMode, User } from '@attraccess/database-entities';
import type {
  AuthenticatedUser,
  PluginAccessPrincipal,
  PluginActiveSession,
  PluginCanStartResult,
  PluginMaintenanceWindow,
  PluginResourceAccessContext,
} from '@attraccess/plugins-backend-sdk';
import type { ResourceActivityVisibilityService } from '../../resources/usage/authorization/resource-activity-visibility.service';
import type { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import type { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import type { RbacService } from '../../users-and-auth/rbac/rbac.service';

const LOOKUP_CONCURRENCY = 20;
const NO_START: PluginCanStartResult = { allowed: false, requiresSupervision: false, supervisionAllowed: false };

/** Core services and lookups the plugin-facing access queries delegate to. */
export interface ResourceAccessDeps {
  usage: Pick<ResourceUsageService, 'canControllResource' | 'getActiveSessionsForResource'>;
  maintenance: Pick<
    ResourceMaintenanceService,
    'canManageMaintenance' | 'getMaintenanceManagedResourceIds' | 'findOverlappingMaintenances'
  >;
  rbac: Pick<RbacService, 'getEffectivePermissions'>;
  visibility: Pick<ResourceActivityVisibilityService, 'resolve'>;
  findUser(userId: number): Promise<User | null>;
  findResource(resourceId: number): Promise<Pick<Resource, 'id' | 'supervisionMode'> | null>;
  listResourceIds(): Promise<number[]>;
}

/**
 * Plugin-facing, read-only facade over core authorization. Holds no logic of its own beyond composition.
 *
 * A principal carrying `effectivePermissions` (an HTTP request's user) is handed to core services as an
 * AuthenticatedUser with that set, intersected with the user's current RBAC permissions. Core services read the
 * attached set instead of the user's full RBAC permissions, so API-token scopes apply exactly as on core routes.
 */
export function createResourceAccessContext(getDeps: () => ResourceAccessDeps): PluginResourceAccessContext {
  const principalId = (principal: PluginAccessPrincipal): number =>
    typeof principal === 'number' ? principal : principal.id;

  /** The permissions a principal may use, or undefined when core should resolve the user's full RBAC set. */
  const scopedPermissions = async (principal: PluginAccessPrincipal): Promise<Set<string> | undefined> => {
    if (typeof principal === 'number' || principal.effectivePermissions === undefined) return undefined;
    const current = await getDeps().rbac.getEffectivePermissions(principal.id);
    return new Set([...principal.effectivePermissions].filter((permission) => current.has(permission)));
  };

  /** Loads the user and attaches the request scope, mirroring what core's auth strategy hands its services. */
  const resolveUser = async (principal: PluginAccessPrincipal): Promise<User | AuthenticatedUser | null> => {
    const user = await getDeps().findUser(principalId(principal));
    if (!user) return null;
    const effectivePermissions = await scopedPermissions(principal);
    return effectivePermissions ? ({ ...user, effectivePermissions } as AuthenticatedUser) : user;
  };

  return {
    async canStart(principal, resourceId): Promise<PluginCanStartResult> {
      const deps = getDeps();
      const resource = await deps.findResource(resourceId);
      const user = resource ? await resolveUser(principal) : null;
      if (!resource || !user) return { ...NO_START };
      const supervisionAllowed =
        resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
        resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;
      const canControl = await deps.usage.canControllResource(resourceId, user);
      // Same rules as the solo-start guard and the reader's requiresSupervisor flag.
      return {
        allowed: canControl && resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED,
        requiresSupervision:
          resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED ||
          (resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED && !canControl),
        supervisionAllowed,
      };
    },

    async canMaintain(principal, resourceId) {
      const user = await resolveUser(principal);
      return user ? getDeps().maintenance.canManageMaintenance(user, resourceId) : false;
    },

    async canSeeUsageAttribution(principal, resourceId) {
      const deps = getDeps();
      // Core's rule grants managers and "all" mode every id, so an unknown resource is ruled out here.
      if (!(await deps.findResource(resourceId))) return false;
      const user = await resolveUser(principal);
      if (!user) return false;
      // The visibility rule reads the attached permission set; background callers get their full RBAC set.
      const effectivePermissions =
        'effectivePermissions' in user ? user.effectivePermissions : await deps.rbac.getEffectivePermissions(user.id);
      return (
        (await deps.visibility.resolve({ ...user, effectivePermissions } as AuthenticatedUser, resourceId)) === 'full'
      );
    },

    async hasPermission(principal, permission) {
      const permissions =
        (await scopedPermissions(principal)) ?? (await getDeps().rbac.getEffectivePermissions(principalId(principal)));
      return permissions.has(permission);
    },

    async listResourceIdsIntroduced(principal) {
      const deps = getDeps();
      const user = await resolveUser(principal);
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

    async listResourceIdsMaintained(principal) {
      const deps = getDeps();
      const user = await resolveUser(principal);
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
