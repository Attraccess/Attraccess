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
    return (await this.reader(user))(resourceId);
  }

  /** One request-wide permissions/settings snapshot; never reuse it across stream deliveries. */
  async filterReadable(resourceIds: number[], user: User & Partial<AuthenticatedUser>): Promise<number[]> {
    const canRead = await this.reader(user);
    const allowed: number[] = [];
    // Bound concurrent resource-specific checks rather than serializing the whole listing.
    for (let offset = 0; offset < resourceIds.length; offset += 8) {
      const batch = resourceIds.slice(offset, offset + 8);
      const decisions = await Promise.all(batch.map(canRead));
      allowed.push(...batch.filter((_, index) => decisions[index]));
    }
    return allowed;
  }

  private async reader(user: User & Partial<AuthenticatedUser>): Promise<(resourceId: number) => Promise<boolean>> {
    if (!user?.id) return async () => false;
    const current = await this.rbac.getEffectivePermissions(user.id, true);
    const has = (key: string) => current.has(key) && (!user.apiTokenId || user.effectivePermissions?.has(key));
    if (has('resources.update')) return async () => true;
    const visibility = await this.settings.getActivityVisibility();
    if (visibility === 'all-resources') return async () => Boolean(has('resources.read'));
    // Owner-specific grants must never supply authority omitted from an API token.
    if (user.apiTokenId && !has('resources.read') && !has('resources.access.manage')) return async () => false;
    return (resourceId) => this.canReadRestricted(resourceId, user, Boolean(has('resources.access.manage')));
  }

  private async canReadRestricted(resourceId: number, user: User, managesAccess: boolean): Promise<boolean> {
    if (managesAccess || (await this.introducers.isIntroducer(resourceId, user.id, true))) return true;
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
