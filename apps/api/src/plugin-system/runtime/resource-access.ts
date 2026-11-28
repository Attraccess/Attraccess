import { SupervisionMode } from '@attraccess/application-models';
import type {
  AuthenticatedUser,
  PluginAccessPrincipal,
  PluginActiveSession,
  PluginCanStartResult,
  PluginHostDataContext,
  PluginMaintenanceWindow,
  PluginResourceAccessContext,
  PluginResourceVisibilityHost,
} from '@attraccess/plugins-backend-sdk';
import type { ResourceGroupsService } from '../../resources/groups/resourceGroups.service';
import type { ResourceListVisibilityService } from '../../resources/visibility/resource-list-visibility.service';
import type { ResourceActivityVisibilityService } from '../../resources/usage/authorization/resource-activity-visibility.service';
import type { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import type { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import type { RbacService } from '../../users-and-auth/rbac/rbac.service';
import type { PluginCoreLookupPort, PluginCoreUser } from '../persistence/plugin-host-data.port';

const LOOKUP_CONCURRENCY = 20;
/** The largest id the database column holds; larger values name no resource and must not reach a query. */
const MAX_ID = 2_147_483_647;
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
  /** Core's machine list rule (ATT-843). */
  listVisibility: Pick<ResourceListVisibilityService, 'filterVisible' | 'scopeOf' | 'groupContext'>;
  groups: Pick<ResourceGroupsService, 'getMany'>;
  /** The existing resources among the ids that the hidden-resource-group rule (ATT-515) leaves visible. */
  filterOutHiddenGroupResources: PluginHostDataContext['resources']['filterVisible'];
  findUser: PluginCoreLookupPort['findUser'];
  findResource: PluginCoreLookupPort['findResourceSupervision'];
  listResourceIds: PluginCoreLookupPort['listResourceIds'];
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
  const resolveUser = async (principal: PluginAccessPrincipal): Promise<PluginCoreUser | AuthenticatedUser | null> => {
    const id = principalId(principal);
    // A malformed principal names no user; it must never reach a lookup that could ignore an undefined condition.
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const user = await getDeps().findUser(id);
    if (!user) return null;
    const effectivePermissions = await scopedPermissions(principal);
    return effectivePermissions ? ({ ...user, effectivePermissions } as AuthenticatedUser) : user;
  };

  /** The user as core's visibility rules read them: `effectivePermissions` is always set. */
  const resolveViewer = async (principal: PluginAccessPrincipal): Promise<AuthenticatedUser | null> => {
    const user = await resolveUser(principal);
    if (!user) return null;
    if ('effectivePermissions' in user) return user as AuthenticatedUser;
    const effectivePermissions = await getDeps().rbac.getEffectivePermissions(user.id);
    return { ...user, effectivePermissions } as AuthenticatedUser;
  };

  /** Core's machine list rule AND the hidden-group rule, so a plugin never shows more than core would. */
  const visibleAmong = async (viewer: AuthenticatedUser, resourceIds: number[]): Promise<number[]> => {
    const deps = getDeps();
    const ids = [...new Set(resourceIds)].filter((id) => Number.isInteger(id) && id > 0 && id <= MAX_ID);
    if (ids.length === 0) return [];
    // This lookup also drops unknown and deleted ids, which core's rule passes through for viewers who see all.
    const shown = await deps.filterOutHiddenGroupResources(viewer.id, ids, {
      seeAll: viewer.effectivePermissions.has('resources.update'),
    });
    const visible = new Set(await deps.listVisibility.filterVisible(viewer, shown));
    return ids.filter((id) => visible.has(id));
  };

  const filterVisible = async (principal: PluginAccessPrincipal, resourceIds: number[]): Promise<number[]> => {
    const viewer = await resolveViewer(principal);
    return viewer ? visibleAmong(viewer, resourceIds) : [];
  };

  return {
    filterVisible,

    async canSee(principal, resourceId) {
      return (await filterVisible(principal, [resourceId])).length > 0;
    },

    async listVisibleResourceIds(principal) {
      const viewer = await resolveViewer(principal);
      return viewer ? visibleAmong(viewer, await getDeps().listResourceIds()) : [];
    },

    async getResourceListScope(principal) {
      const viewer = await resolveViewer(principal);
      return viewer ? getDeps().listVisibility.scopeOf(viewer) : 'permitted';
    },

    async filterVisibleGroups(principal, groupIds) {
      const deps = getDeps();
      const viewer = groupIds.length > 0 ? await resolveViewer(principal) : null;
      if (!viewer) return [];
      const groups = await deps.groups.getMany(await deps.listVisibility.groupContext(viewer));
      const visible = new Set(groups.map((group) => group.id));
      return [...new Set(groupIds)].filter((id) => visible.has(id));
    },

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

/**
 * The host side of the SDK's `@ResourceVisible()` decorator: only `canSee`. Its token is global, so every plugin module
 * can inject it whatever the plugin's permissions; the full `resourceAccess` stays behind `ACCESS_RESOURCES`.
 */
export function createResourceVisibilityHost(access: PluginResourceAccessContext): PluginResourceVisibilityHost {
  return Object.freeze({
    canSee: (principal: PluginAccessPrincipal, resourceId: number) => access.canSee(principal, resourceId),
  });
}
