import { Resource, ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, FindOneOptions, In, Repository } from 'typeorm';

import { ProjectsService } from '../../../projects/projects.service';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { activeUsageWhere, getSessionCapacity } from './active-usage';

/** Reads of active and past usage sessions, and the project assignment of an ended one. */
@Injectable()
export class UsageSessionRecords {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly projectsService: ProjectsService,
  ) {}

  private readonly DETAIL_RELATIONS = [
    'user',
    'project',
    'supervisorUser',
    'formSubmissions',
    'formSubmissions.form',
    'formSubmissions.user',
  ];

  /**
   * The caller's own active session when `preferUserId` has one, otherwise the newest.
   * Identical to the single-session behaviour at limit 1.
   */
  public async getActiveSession(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preferUserId?: number,
  ): Promise<ResourceUsage | null> {
    const sessions = await this.getActiveSessionsForResource(resourceId, transactionalEntityManager);
    if (sessions.length === 0) return null;
    return (
      (preferUserId === undefined ? undefined : sessions.find((session) => session.userId === preferUserId)) ??
      sessions[sessions.length - 1]
    );
  }

  /** All active sessions of one resource, earliest started first. */
  public async getActiveSessionsForResource(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage[]> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    return await resourceUsageRepository.find({
      where: { resourceId, ...activeUsageWhere() },
      order: { startTime: 'ASC', id: 'ASC' },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
  }

  public async getActiveSessions(resourceIds: number[]): Promise<Map<number, ResourceUsage[]>> {
    const map = new Map<number, ResourceUsage[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const sessions = await this.resourceUsageRepository.find({
      where: { resourceId: In(resourceIds), ...activeUsageWhere() },
      order: { startTime: 'ASC', id: 'ASC' },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
    for (const session of sessions) map.get(session.resourceId)?.push(session);
    return map;
  }

  public async getActiveSessionOverview(
    resourceId: number,
    userId: number,
  ): Promise<{
    usage: ResourceUsage | null;
    usages: ResourceUsage[];
    activeSessionCount: number;
    maxParallelSessions: number;
    isFull: boolean;
  }> {
    const [usages, resource] = await Promise.all([
      this.getActiveSessionsForResource(resourceId),
      this.resourceRepository.findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      }),
    ]);
    const usage = usages.find((session) => session.userId === userId) ?? usages[usages.length - 1] ?? null;
    return {
      usage,
      usages,
      ...getSessionCapacity(
        { type: resource?.type ?? ResourceType.Machine, maxParallelSessions: resource?.maxParallelSessions ?? 1 },
        usages.length,
      ),
    };
  }

  /**
   * Opens a session for a viewer. Allowed: their own, any when `canViewAll`, and project-linked ones for members of
   * that project (as on main, whatever their activity access). Otherwise `redact` gives the view they may have, or
   * the session does not exist for them: always a 404, so nothing tells a hidden session from a missing one.
   */
  async getSessionDetails(
    resourceId: number,
    usageId: number,
    user: AuthenticatedUser,
    canViewAll = false,
    redact?: (usage: ResourceUsage) => ResourceUsage,
  ): Promise<ResourceUsage> {
    const usage = await this.resourceUsageRepository.findOne({
      where: { id: usageId, resourceId, lifecyclePending: false },
      relations: this.DETAIL_RELATIONS,
    });
    if (!usage) throw new NotFoundException('Usage session not found');
    if (usage.userId === user.id || canViewAll) return usage;

    if (usage.projectId) {
      try {
        await this.projectsService.findOneById(user.id, usage.projectId);
        return usage;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    if (redact) return redact(usage);
    throw new NotFoundException('Usage session not found');
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    const whereClause: FindOneOptions<ResourceUsage>['where'] = { resourceId, lifecyclePending: false };

    // Add userId filter if provided
    if (userId) {
      whereClause.userId = userId;
      this.logger.debug(`Filtering usage history by userId ${userId}`);
    }

    const [data, total] = await this.resourceUsageRepository.findAndCount({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      order: { startTime: 'DESC' },
      relations: this.DETAIL_RELATIONS,
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }

  async updateSessionProject(
    resourceId: number,
    usageId: number,
    user: User,
    dto: UpdateUsageSessionProjectDto,
  ): Promise<ResourceUsage> {
    this.logger.debug(`Updating project for usage session ${usageId} on resource ${resourceId} by user ${user.id}`, {
      dto,
    });

    const usage = await this.resourceUsageRepository.findOne({
      where: { id: usageId, resourceId },
      relations: ['user', 'project', 'resource'],
    });

    if (!usage) {
      throw new NotFoundException('Usage session not found');
    }

    if (!usage.endTime) {
      throw new BadRequestException('Usage session is still active');
    }

    if (usage.usageAction !== ResourceUsageAction.Usage) {
      throw new BadRequestException('Only usage sessions can be assigned to projects');
    }

    if (usage.userId !== user.id) {
      this.logger.warn(`User ${user.id} not authorized to update session ${usage.id} owned by user ${usage.userId}`);
      throw new ForbiddenException('You are not authorized to update this session');
    }

    if (dto.projectId === undefined) {
      throw new BadRequestException('Project assignment is required');
    }

    if (dto.projectId === null) {
      usage.projectId = null;
      usage.project = null;
    } else {
      const project = await this.projectsService.findOneById(user.id, dto.projectId);
      usage.projectId = project.id;
      usage.project = project;
    }

    await this.resourceUsageRepository.save(usage);

    return await this.resourceUsageRepository.findOne({
      where: { id: usage.id },
      relations: ['resource', 'user', 'project'],
    });
  }
}
