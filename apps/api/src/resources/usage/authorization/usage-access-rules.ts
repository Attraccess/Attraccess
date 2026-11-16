import { User } from '@attraccess/database-entities';

import { Injectable, Logger } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { ResourceGroupsIntroductionsService } from '../../groups/introductions/resourceGroups.introductions.service';

import { ResourceGroupsService } from '../../groups/resourceGroups.service';

import { ResourceIntroducersService } from '../../introducers/resourceIntroducers.service';

import { ResourceIntroductionsService } from '../../introductions/resouceIntroductions.service';

import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

/** Who may control a resource: resource managers, introduced users, introducers/maintainers and group introductions. */
@Injectable()
export class UsageAccessRules {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly resourceIntroductionService: ResourceIntroductionsService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
    private readonly resourceGroupsService: ResourceGroupsService,
    private readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService,
    private readonly resourceRetrainingService: ResourceRetrainingService,
  ) {}

  async canControl(
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    if (canUpdateResource) {
      return true;
    }

    if (await this.resourceIntroductionService.hasValidIntroduction(resourceId, user.id, transactionalEntityManager)) {
      if (!(await this.resourceRetrainingService.isResourceIntroductionBlocked(resourceId, user.id))) {
        this.logger.debug(`User ${user.id} has valid introduction for resource ${resourceId}`);
        return true;
      }
      this.logger.debug(`User ${user.id} introduction for resource ${resourceId} is blocked pending retraining`);
    }

    if (await this.resourceIntroducersService.canMaintain(resourceId, user.id, true, transactionalEntityManager)) {
      this.logger.debug(`User ${user.id} is an introducer or maintainer for resource ${resourceId}`);
      return true;
    }

    const groupsOfResource = await this.resourceGroupsService.getGroupsOfResource(
      resourceId,
      transactionalEntityManager,
    );
    for (const group of groupsOfResource) {
      if (
        await this.resourceGroupsIntroductionsService.hasValidIntroduction(
          { groupId: group.id, userId: user.id },
          transactionalEntityManager,
        )
      ) {
        if (!(await this.resourceRetrainingService.isGroupIntroductionBlocked(group.id, user.id))) {
          this.logger.debug(`User ${user.id} has valid group introduction for resource ${resourceId}`);
          return true;
        }
        this.logger.debug(
          `User ${user.id} group introduction (${group.id}) for resource ${resourceId} is blocked pending retraining`,
        );
      }
    }

    this.logger.debug(`User ${user.id} cannot control resource ${resourceId}`);
    return false;
  }
}
