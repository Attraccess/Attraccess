import { FormSubmission, Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUnhealthyException } from '../../exceptions/resource.unhealthy.exception';
import { UsageSupervisionPermissionsImplementation } from './usage-supervision-permissions';
export abstract class UsageResourceGatesImplementation extends UsageSupervisionPermissionsImplementation {
  protected async getResource(
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
      const canStartSession = await this.canControllResource(resourceId, user, transactionalEntityManager);

      if (!canStartSession) {
        this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
    }

    return resource;
  }

  protected getResourceUsageFlowPayload(resourceUsage: ResourceUsage, formSubmissions?: FormSubmission[]) {
    const normalizedFormSubmissions = formSubmissions ?? [];
    const mappedFormSubmissions: {
      [key: string]: { formName: string; answers: { [key: number]: { value: string; name: string } } };
    } = {};

    normalizedFormSubmissions.forEach((submission) => {
      mappedFormSubmissions[submission.form.id] = {
        formName: submission.form.name,
        answers: Object.fromEntries(
          Object.values(submission.data).map((field) => [
            field.fieldDefinition.id,
            { value: field.value, name: field.fieldDefinition.name },
          ]),
        ),
      };
    });

    const usageUser =
      resourceUsage.user ??
      (resourceUsage.userId != null ? ({ id: resourceUsage.userId } as Pick<User, 'id'> & Partial<User>) : undefined);

    const sanitizedUser: (Partial<User> & Pick<User, 'id'>) | undefined = usageUser
      ? {
          id: usageUser.id,
          username: usageUser.username,
          email: usageUser.email,
          createdAt: usageUser.createdAt,
          updatedAt: usageUser.updatedAt,
          billingFactor: usageUser.billingFactor,
          creditBalance: usageUser.creditBalance,
        }
      : undefined;

    const flowPayload = {
      ...resourceUsage,
      resource: {
        ...resourceUsage.resource,
        documentationMarkdown: undefined,
        documentationUrl: undefined,
        documentationType: undefined,
        metadata: resourceUsage.resource?.metadata ?? null,
      } as Partial<Resource>,
      user: sanitizedUser,
      formSubmissions: mappedFormSubmissions,
    };

    return flowPayload;
  }
}
