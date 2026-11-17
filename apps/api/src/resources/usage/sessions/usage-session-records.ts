import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { TransactionScope } from '../../../database/unit-of-work';

import { ProjectsService } from '../../../projects/projects.service';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { USAGE_SESSION_STORE, UsageSessionStore } from '../usage-session-store.port';

import { getSessionCapacity } from './active-usage';

/** Reads of active and past usage sessions, and the project assignment of an ended one. */
@Injectable()
export class UsageSessionRecords {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @Inject(USAGE_SESSION_STORE) private readonly sessionStore: UsageSessionStore,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * The caller's own active session when `preferUserId` has one, otherwise the newest.
   * Identical to the single-session behaviour at limit 1.
   */
  public async getActiveSession(
    resourceId: number,
    context?: TransactionScope,
    preferUserId?: number,
  ): Promise<UsageSession | null> {
    const sessions = await this.getActiveSessionsForResource(resourceId, context);
    if (sessions.length === 0) return null;
    return (
      (preferUserId === undefined ? undefined : sessions.find((session) => session.userId === preferUserId)) ??
      sessions[sessions.length - 1]
    );
  }

  /** All active sessions of one resource, earliest started first. */
  public async getActiveSessionsForResource(resourceId: number, context?: TransactionScope): Promise<UsageSession[]> {
    return this.sessionStore.findActiveSessions(resourceId, context);
  }

  public async getActiveSessions(resourceIds: number[]): Promise<Map<number, UsageSession[]>> {
    return this.sessionStore.findActiveSessionsByResource(resourceIds);
  }

  public async getActiveSessionOverview(
    resourceId: number,
    userId: number,
  ): Promise<{
    usage: UsageSession | null;
    usages: UsageSession[];
    activeSessionCount: number;
    maxParallelSessions: number;
    isFull: boolean;
  }> {
    const [usages, resource] = await Promise.all([
      this.getActiveSessionsForResource(resourceId),
      this.sessionStore.findMachineCapacity(resourceId),
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
    redact?: (usage: UsageSession) => UsageSession,
  ): Promise<UsageSession> {
    const usage = await this.sessionStore.findPublishedSession(resourceId, usageId);
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
  ): Promise<{ data: UsageSession[]; total: number }> {
    if (userId) this.logger.debug(`Filtering usage history by userId ${userId}`);

    const { data, total } = await this.sessionStore.findHistory(resourceId, page, limit, userId);

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }

  async updateSessionProject(
    resourceId: number,
    usageId: number,
    user: Pick<UsageSessionUser, 'id'>,
    dto: UpdateUsageSessionProjectDto,
  ): Promise<UsageSession> {
    this.logger.debug(`Updating project for usage session ${usageId} on resource ${resourceId} by user ${user.id}`, {
      dto,
    });

    const usage = await this.sessionStore.findSessionForProjectChange(resourceId, usageId);

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

    const project = dto.projectId === null ? null : await this.projectsService.findOneById(user.id, dto.projectId);

    return this.sessionStore.assignProject(usage, project);
  }
}
