import { Resource, ResourceUsage, User, SupervisionMode } from '@attraccess/database-entities';

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, Repository } from 'typeorm';

import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../../exceptions/resource.maintenance.inUse.exception';

import { ResourceNotFoundException } from '../../../exceptions/resource.notFound.exception';

import { ResourceUnhealthyException } from '../../../exceptions/resource.unhealthy.exception';

import { RbacService } from '../../../users-and-auth/rbac/rbac.service';

import { ResourceHealthService } from '../../health/resource-health.service';

import { ResourceIntroducersService } from '../../introducers/resourceIntroducers.service';

import { ResourceMaintenanceService } from '../../maintenances/maintenance.service';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { UsageAccessCache } from './usage-access-cache';

/** The checks in front of a usage action: maintenance, health, control permission and supervision. */
@Injectable()
export class UsageResourceGate {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly resourceMaintenanceService: ResourceMaintenanceService,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
    private readonly rbacService: RbacService,
    private readonly access: UsageAccessCache,
  ) {}

  async getResource(
    resourceId: number,
    user: User,
    opts: { checkMaintenance: boolean; checkControlPermission: boolean },
    transactionalEntityManager?: EntityManager,
  ): Promise<Resource> {
    const { checkMaintenance, checkControlPermission } = opts;

    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = await resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      this.logger.warn(`Resource ${resourceId} not found`);
      throw new ResourceNotFoundException(resourceId);
    }
    this.logger.debug(`Found resource ${resourceId}: ${resource.name}`);

    if (checkMaintenance) {
      // Single enforcement point for maintenance mode: only users who can manage maintenance
      // may start a session (or lock/unlock door, etc.). Applies to both manual and
      // schedule-triggered maintenances (see hasActiveMaintenance).
      const hasActiveMaintenance = await this.resourceMaintenanceService.hasActiveMaintenance(
        resourceId,
        transactionalEntityManager,
      );
      if (hasActiveMaintenance) {
        // Check if user can manage maintenance (which allows them to use during maintenance)
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );

        if (!canManageMaintenance) {
          this.logger.warn(
            `User ${user.id} attempted to use resource ${resourceId} during maintenance window without permissions`,
          );
          throw new ResourceUsageImpossibleMaintenanceInProgressException(resourceId);
        }

        this.logger.debug(`User ${user.id} has maintenance permissions, allowing usage during maintenance window`);
      }

      // Health gate: block non-maintenance users when any health entry is unhealthy.
      // Users that can manage maintenance are intentionally allowed through so they can investigate/repair.
      const isUnhealthy = await this.resourceHealthService.isResourceUnhealthy(resourceId);
      if (isUnhealthy) {
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );
        if (!canManageMaintenance) {
          this.logger.warn(`User ${user.id} blocked from resource ${resourceId} because it is currently unhealthy`);
          throw new ResourceUnhealthyException(resourceId);
        }
        this.logger.debug(
          `User ${user.id} has maintenance permissions, allowing usage despite unhealthy state on resource ${resourceId}`,
        );
      }
    }

    if (checkControlPermission) {
      const canStartSession = await this.access.canControllResource(resourceId, user, transactionalEntityManager);

      if (!canStartSession) {
        this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
    }

    return resource;
  }

  /**
   * Validates that a supervised start is permissible for the given resource and supervisor.
   *
   * Throws when:
   * - the resource does not allow supervision (supervisionMode is INTRODUCTION_REQUIRED),
   * - the requester selected themselves as supervisor,
   * - the supervisor does not exist,
   * - the supervisor is not an introducer for the resource.
   *
   * Does NOT check the requester's own introduction status: a supervised start exists precisely to
   * let a non-introduced user start under a qualified supervisor.
   */
  public async validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<void> {
    await this.assertSupportsSupervision(resourceId, transactionalEntityManager, preloadedResource);

    if (supervisorUserId === requester.id) {
      throw new BadRequestException('You cannot supervise your own session');
    }

    const userRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(User)
      : this.userRepository;

    const supervisor = await userRepository.findOne({ where: { id: supervisorUserId } });
    if (!supervisor) {
      throw new NotFoundException(`Supervisor with ID ${supervisorUserId} not found`);
    }

    const supervisorIsIntroducer = await this.resourceIntroducersService.isIntroducer(
      resourceId,
      supervisorUserId,
      true,
      transactionalEntityManager,
    );

    if (!supervisorIsIntroducer) {
      throw new ForbiddenException('The selected supervisor is not authorized to supervise this resource');
    }
  }

  /**
   * Resolves the resource and asserts its supervisionMode permits supervised sessions at all.
   * Split out of {@link validateSupervisedStart} because the reader-armed flow (ATT-816) has no
   * named supervisor to validate yet — any eligible one may show up and tap.
   */
  public async assertSupportsSupervision(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<Resource> {
    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = preloadedResource ?? (await resourceRepository.findOne({ where: { id: resourceId } }));
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    if (
      resource.supervisionMode !== SupervisionMode.SUPERVISION_ALLOWED &&
      resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED
    ) {
      throw new BadRequestException('This resource does not support supervised sessions');
    }

    return resource;
  }

  /** Owners, supervisors, resource managers and maintainers may end a session; returns whether `user` owns it. */
  async assertMayEndSession(activeSession: ResourceUsage, user: User): Promise<boolean> {
    // Prefer already-populated effectivePermissions on the request-bound user (set by SessionStrategy)
    const userPermissions =
      (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
    const canUpdateResources = userPermissions.has('resources.update');
    const isSessionOwner = activeSession.user.id === user.id;
    // The supervisor of a supervised session may end it as well.
    const isSupervisor = activeSession.supervisorUserId != null && activeSession.supervisorUserId === user.id;

    if (!isSessionOwner && !isSupervisor && !canUpdateResources) {
      const canMaintain = await this.resourceIntroducersService.canMaintain(activeSession.resourceId, user.id, true);
      if (!canMaintain) {
        this.logger.warn(
          `User ${user.id} not authorized to end session ${activeSession.id} owned by user ${activeSession.user.id}`,
        );
        throw new ForbiddenException('You are not authorized to end this session');
      }
    }
    return isSessionOwner;
  }
}
