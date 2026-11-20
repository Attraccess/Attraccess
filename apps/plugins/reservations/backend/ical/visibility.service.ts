import { type PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { AccessService } from '../reservations/access.service';
import { type AccessSubject, subjectUserId } from '../reservations/actor';

/**
 * Which resources a user may see. Core hides resources that only belong to hidden groups unless the
 * user holds `resources.update`, is an introducer/maintainer of such a group, or has an active
 * introduction to it (`ResourceGroupsService.visibleGroupsQuery`). The host answers it through
 * `hostData.resources.filterVisible` (ACCESS_RESOURCES), so the rule never drifts from core.
 */
@Injectable()
export class VisibilityService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  /**
   * The subset of `resourceIds` (existing resources) the user may see. A request actor's scope applies to the
   * `resources.update` shortcut, as core applies an API token's scope to its group visibility.
   */
  async filterVisible(subject: AccessSubject, resourceIds: number[]): Promise<number[]> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) return [];
    return this.context.hostData.resources.filterVisible(subjectUserId(subject), ids, {
      seeAll: await this.access.hasUpdatePermission(subject),
    });
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
