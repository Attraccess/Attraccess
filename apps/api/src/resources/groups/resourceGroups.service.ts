import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { CreateResourceGroupDto } from './dto/createGroup.dto';
import { UpdateResourceGroupDto } from './dto/updateGroup.dto';
import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';
import { MetricsService } from '../../metrics/metrics.service';

interface GetOneSearchOptions {
  id: number;
}

export interface GroupVisibilityContext {
  userId: number;
  canUpdateResources: boolean;
}

@Injectable()
export class ResourceGroupsService {
  constructor(
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Whether the user is "part of" the group: an introducer/maintainer of it, or has a currently
   * valid introduction to it.
   *
   * An introduction counts only if its latest history item is a GRANT — revoked introductions keep
   * their row (and a REVOKE history item) in the database but must not grant visibility.
   */
  public async userIsPartOfGroup(groupId: number, userId: number): Promise<boolean> {
    const introducerCount = await this.resourceIntroducerRepository.count({
      where: { resourceGroupId: groupId, userId },
    });
    if (introducerCount > 0) {
      return true;
    }

    const activeIntroductions = await this.resourceIntroductionRepository.query(
      `SELECT 1 FROM "resource_introduction" "rin"
       WHERE "rin"."resourceGroupId" = ? AND "rin"."receiverUserId" = ?
       AND (
         SELECT "h"."action" FROM "resource_introduction_history_item" "h"
         WHERE "h"."introductionId" = "rin"."id"
         ORDER BY "h"."createdAt" DESC, "h"."id" DESC
         LIMIT 1
       ) = 'grant'
       LIMIT 1`,
      [groupId, userId],
    );
    return activeIntroductions.length > 0;
  }

  /**
   * SQL fragment (for use against the `group` query-builder alias) that is true when the user has a
   * currently valid (latest history item = GRANT) introduction to the group. Uses the `:userId`
   * named parameter.
   */
  private static readonly ACTIVE_INTRODUCTION_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM "resource_introduction" "rin"
    WHERE "rin"."resourceGroupId" = group.id AND "rin"."receiverUserId" = :userId
    AND (
      SELECT "h"."action" FROM "resource_introduction_history_item" "h"
      WHERE "h"."introductionId" = "rin"."id"
      ORDER BY "h"."createdAt" DESC, "h"."id" DESC
      LIMIT 1
    ) = 'grant'
  )`;

  public async createOne(dto: CreateResourceGroupDto): Promise<ResourceGroup> {
    const resourceGroup = this.resourceGroupRepository.create({
      name: dto.name,
      description: dto.description,
      retrainingMaxAgeDays: dto.retrainingMaxAgeDays ?? null,
      retrainingMaxInactivityDays: dto.retrainingMaxInactivityDays ?? null,
      retrainingBlocksAccess: dto.retrainingBlocksAccess ?? false,
      isHidden: dto.isHidden ?? false,
    });
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    this.metricsService.resourceGroupsTotal.inc();
    return savedResourceGroup;
  }

  public async getMany(visibility?: GroupVisibilityContext): Promise<ResourceGroup[]> {
    // Users that can manage resources (and any caller without a visibility context) see every group.
    if (!visibility || visibility.canUpdateResources) {
      return await this.resourceGroupRepository.find();
    }

    return await this.resourceGroupRepository
      .createQueryBuilder('group')
      .where('group.isHidden = :notHidden', { notHidden: false })
      .orWhere(
        `EXISTS (SELECT 1 FROM "resource_introducer" "ri" WHERE "ri"."resourceGroupId" = group.id AND "ri"."userId" = :userId)`,
        { userId: visibility.userId },
      )
      .orWhere(ResourceGroupsService.ACTIVE_INTRODUCTION_EXISTS_SQL, { userId: visibility.userId })
      .getMany();
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

  public async updateOneById(id: number, updateDto: UpdateResourceGroupDto): Promise<ResourceGroup> {
    const resourceGroup = await this.getOne({ id });

    const savedResourceGroup = await this.resourceGroupRepository.save({
      ...resourceGroup,
      name: updateDto.name,
      description: updateDto.description,
      retrainingMaxAgeDays:
        updateDto.retrainingMaxAgeDays !== undefined ? updateDto.retrainingMaxAgeDays : resourceGroup.retrainingMaxAgeDays,
      retrainingMaxInactivityDays:
        updateDto.retrainingMaxInactivityDays !== undefined
          ? updateDto.retrainingMaxInactivityDays
          : resourceGroup.retrainingMaxInactivityDays,
      retrainingBlocksAccess:
        updateDto.retrainingBlocksAccess !== undefined
          ? updateDto.retrainingBlocksAccess
          : resourceGroup.retrainingBlocksAccess,
      isHidden: updateDto.isHidden !== undefined ? updateDto.isHidden : resourceGroup.isHidden,
    });
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    return savedResourceGroup;
  }

  public async addResource(groupId: number, resourceId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);

    const existingResource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (existingResource) {
      return;
    }

    const resource = await this.resourceRepository.findOne({
      where: {
        id: resourceId,
      },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    resourceGroup.resources.push(resource);
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id, [resourceId]),
    );
  }

  public async removeResource(groupId: number, resourceId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const resource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (!resource) {
      return;
    }

    resourceGroup.resources = resourceGroup.resources.filter((resource) => resource.id !== resourceId);
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id, [resourceId]),
    );
  }

  public async deleteOne(groupId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const result = await this.resourceGroupRepository.delete(groupId);
    if (result.affected === 0) {
      throw new ResourceGroupNotFoundException({ id: groupId });
    }
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(
        groupId,
        resourceGroup.resources.map((resource) => resource.id),
      ),
    );
    this.metricsService.resourceGroupsTotal.dec();
  }

  public async getGroupsOfResource(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceGroup[]> {
    const resourceGroupRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceGroup)
      : this.resourceGroupRepository;

    return await resourceGroupRepository.find({
      where: {
        resources: {
          id: resourceId,
        },
      },
    });
  }
}
