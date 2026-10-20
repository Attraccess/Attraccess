import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';

@Injectable()
export class ResourceActivityPolicy {
  constructor(
    private readonly settings: SettingsService,
    private readonly rbac: RbacService,
    private readonly introductions: ResourceIntroductionsService,
    private readonly introducers: ResourceIntroducersService,
    private readonly groups: ResourceGroupsService,
    private readonly groupIntroductions: ResourceGroupsIntroductionsService,
    private readonly retraining: ResourceRetrainingService,
  ) {}

  async canRead(resourceId: number, user: User & Partial<AuthenticatedUser>): Promise<boolean> {
    if (!user?.id) return false;
    const current = await this.rbac.getEffectivePermissions(user.id, true);
    const has = (key: string) => current.has(key) && (!user.apiTokenId || user.effectivePermissions?.has(key));
    if (has('resources.update')) return true;
    if ((await this.settings.getActivityVisibility()) === 'all-resources') return Boolean(has('resources.read'));
    if (has('resources.access.manage') || (await this.introducers.isIntroducer(resourceId, user.id, true))) return true;
    if (
      (await this.introductions.hasValidIntroduction(resourceId, user.id)) &&
      !(await this.retraining.isResourceIntroductionBlocked(resourceId, user.id))
    )
      return true;
    for (const group of await this.groups.getGroupsOfResource(resourceId)) {
      if (
        (await this.groupIntroductions.hasValidIntroduction({ groupId: group.id, userId: user.id })) &&
        !(await this.retraining.isGroupIntroductionBlocked(group.id, user.id))
      )
        return true;
    }
    return false;
  }

  async assertRead(resourceId: number, user: User & Partial<AuthenticatedUser>): Promise<void> {
    if (!(await this.canRead(resourceId, user))) throw new ForbiddenException('Resource activity is private');
  }
}
