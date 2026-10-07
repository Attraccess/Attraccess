import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';
import { ResourceGroupWritingImplementation } from './resource-group-writing';
import { GetOneSearchOptions, GroupVisibilityContext } from './resourceGroups.service.route-context';

@Injectable()
export class ResourceGroupsService extends ResourceGroupWritingImplementation {
  constructor(
    @InjectRepository(ResourceGroup)
    protected readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    protected readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(ResourceIntroduction)
    protected readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  /**
   * SQL fragment (for use against the `group` query-builder alias) that is true when the user has a
   * currently valid (latest history item = GRANT) introduction to the group. Uses the `:userId`
   * named parameter.
   */
  protected static readonly ACTIVE_INTRODUCTION_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM "resource_introduction" "rin"
    WHERE "rin"."resourceGroupId" = group.id AND "rin"."receiverUserId" = :userId
    AND (
      SELECT "h"."action" FROM "resource_introduction_history_item" "h"
      WHERE "h"."introductionId" = "rin"."id"
      ORDER BY "h"."createdAt" DESC, "h"."id" DESC
      LIMIT 1
    ) = 'grant'
  )`;

  protected visibleGroupsQuery(visibility?: GroupVisibilityContext) {
    const query = this.resourceGroupRepository.createQueryBuilder('group');
    if (!visibility || visibility.canUpdateResources) return query;

    return query
      .where('group.isHidden = :notHidden', { notHidden: false })
      .orWhere(
        `EXISTS (SELECT 1 FROM "resource_introducer" "ri" WHERE "ri"."resourceGroupId" = group.id AND "ri"."userId" = :userId)`,
        { userId: visibility.userId },
      )
      .orWhere(ResourceGroupsService.ACTIVE_INTRODUCTION_EXISTS_SQL, { userId: visibility.userId });
  }

  public async getMany(visibility?: GroupVisibilityContext): Promise<ResourceGroup[]> {
    return this.visibleGroupsQuery(visibility).getMany();
  }

  public async hasVisibleResources(visibility: GroupVisibilityContext): Promise<boolean> {
    const resources = this.resourceRepository.createQueryBuilder('resource');
    if (visibility.canUpdateResources) return resources.getExists();

    const visibleGroups = this.visibleGroupsQuery(visibility).select('group.id');
    return resources
      .leftJoin('resource.groups', 'resourceGroup')
      .where('resourceGroup.id IS NULL')
      .orWhere(`resourceGroup.id IN (${visibleGroups.getQuery()})`)
      .setParameters(visibleGroups.getParameters())
      .getExists();
  }

  public async getOne(
    searchOptions: GetOneSearchOptions,
    relations?: string[],
    visibility?: GroupVisibilityContext,
  ): Promise<ResourceGroup> {
    const group = await this.resourceGroupRepository.findOne({
      where: {
        id: searchOptions.id,
      },

      relations,
    });

    if (!group) {
      throw new ResourceGroupNotFoundException({ id: searchOptions.id });
    }

    // Hidden groups are only visible to managers and users that are part of the group.
    if (group.isHidden && visibility && !visibility.canUpdateResources) {
      const isPartOfGroup = await this.userIsPartOfGroup(group.id, visibility.userId);
      if (!isPartOfGroup) {
        throw new ResourceGroupNotFoundException({ id: searchOptions.id });
      }
    }

    return group;
  }
}

export { GroupVisibilityContext } from './resourceGroups.service.route-context';
