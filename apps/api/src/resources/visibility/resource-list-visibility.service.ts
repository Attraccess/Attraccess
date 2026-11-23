import { Inject, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { concatMap, filter } from 'rxjs/operators';
import type { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from '../../settings/settings.service';
import { RESOURCE_STORE, type ResourceStore } from '../resource-store.port';
import type { GroupVisibilityContext } from '../groups/resource-group-store.port';
import { isResourceManager } from './is-resource-manager';

/** `all`: the viewer sees every machine. `permitted`: the list is narrowed to the machines the viewer may see. */
export type ResourceListScope = 'all' | 'permitted';

/**
 * The single rule behind "who can see the machine list" (ATT-843), used by the lists, the per-machine routes, the
 * dashboard and the live updates.
 *
 * - Holders of `resources.update` or `resources.access.manage` see every machine in both modes.
 * - Mode `authenticated`: accounts with `resources.read` see every machine.
 * - Everyone else (mode `permitted-only`, or no `resources.read`) sees the machines they are introduced to
 *   (directly or through a group), introduce or maintain, or currently use.
 */
@Injectable()
export class ResourceListVisibilityService {
  constructor(
    private readonly settings: SettingsService,
    @Inject(RESOURCE_STORE) private readonly store: ResourceStore,
  ) {}

  async scopeOf(user: AuthenticatedUser): Promise<ResourceListScope> {
    if (isResourceManager(user)) return 'all';
    if (user.effectivePermissions?.has('resources.read') !== true) return 'permitted';
    return (await this.settings.getResourceListVisibility()) === 'authenticated' ? 'all' : 'permitted';
  }

  /** The user id the machine query must narrow to, or undefined when the viewer sees every machine. */
  async permittedForUserId(user: AuthenticatedUser): Promise<number | undefined> {
    return (await this.scopeOf(user)) === 'permitted' ? user.id : undefined;
  }

  async canSee(user: AuthenticatedUser, resourceId: number): Promise<boolean> {
    return (await this.filterVisible(user, [resourceId])).includes(resourceId);
  }

  /** The ids the viewer may see, in the order given. Ids of machines that do not exist are never visible to a narrowed viewer. */
  async filterVisible(user: AuthenticatedUser, resourceIds: number[]): Promise<number[]> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0 || (await this.scopeOf(user)) === 'all') return ids;
    const permitted = new Set(await this.store.permittedIds(user.id, ids));
    return ids.filter((id) => permitted.has(id));
  }

  /** The group-list rules for this viewer: hidden groups (ATT-515) and, when narrowed, groups without visible machines. */
  async groupContext(user: AuthenticatedUser): Promise<GroupVisibilityContext> {
    return {
      userId: user.id,
      canUpdateResources: user.effectivePermissions?.has('resources.update') === true,
      permittedOnly: (await this.scopeOf(user)) === 'permitted',
    };
  }

  /**
   * Drops the events of a machine the viewer may no longer see. The check runs again for every event (keepalives
   * excepted), so a changed setting or a revoked introduction takes effect on open streams. Events about the viewer's
   * own session always pass: when it ends, the machine may already be hidden from someone who saw it only through
   * that session, and they must still hear that it ended.
   */
  followVisible<T extends { data: object }>(stream: Observable<T>, user: AuthenticatedUser, resourceId: number) {
    const isOwnSession = (data: { usage?: { userId?: number }; ownerUserId?: unknown }) =>
      data.usage?.userId === user.id || data.ownerUserId === user.id;
    return stream.pipe(
      concatMap(async (event) =>
        'keepalive' in event.data || isOwnSession(event.data) || (await this.canSee(user, resourceId)) ? event : null,
      ),
      filter((event): event is T => event !== null),
    );
  }
}
