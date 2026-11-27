import { type PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { type AccessSubject, accessPrincipal } from '../reservations/actor';

/**
 * Which resources a user may see. The host decides (`context.resourceAccess`, ACCESS_RESOURCES): core's "who can see
 * the machine list" setting together with the hidden-resource-group rule, so the plugin never rebuilds either. Request
 * actors keep their API-token scope; a plain user id (iCal feeds) is answered with the user's full permissions.
 */
@Injectable()
export class VisibilityService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /** The subset of `resourceIds` (existing resources) the user may see. */
  async filterVisible(subject: AccessSubject, resourceIds: number[]): Promise<number[]> {
    if (resourceIds.length === 0) return [];
    return this.context.resourceAccess.filterVisible(accessPrincipal(subject), resourceIds);
  }

  /** Whether the resource exists and the user may see it. */
  canSee(subject: AccessSubject, resourceId: number): Promise<boolean> {
    return this.context.resourceAccess.canSee(accessPrincipal(subject), resourceId);
  }

  /**
   * Whether the account exists, is not soft-deleted and not disabled. Deleting or disabling a user keeps
   * their role rows, so anything acting on their behalf without a session (iCal feeds) must check this.
   */
  isActiveAccount(userId: number): Promise<boolean> {
    return this.context.hostData.users.isActive(userId);
  }

  /** The subset of `resourceIds` whose sessions always need a supervisor (`supervision_required`). */
  resourceIdsRequiringSupervision(resourceIds: number[]): Promise<number[]> {
    const ids = [...new Set(resourceIds)];
    return ids.length === 0 ? Promise.resolve([]) : this.context.hostData.resources.filterRequiringSupervision(ids);
  }

  /** Ids of all resources in the given groups. */
  resourceIdsOfGroups(groupIds: number[]): Promise<number[]> {
    return this.context.hostData.resources.listIdsInGroups(groupIds);
  }
}
