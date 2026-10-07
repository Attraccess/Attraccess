import { Resource, ResourceIntroducer, User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { EntityManager, In } from 'typeorm';
import { MaintenanceWritingImplementation } from './maintenance-writing';
export abstract class MaintenanceManagementAccessImplementation extends MaintenanceWritingImplementation {
  /**
   * Return every resource from a list whose maintenance a user may manage.
   * One query covers both direct resource roles and roles inherited from groups.
   */
  async getMaintenanceManagedResourceIds(
    user: User | AuthenticatedUser,
    resourceIds: number[],
    effectivePermissions?: Set<string>,
    transactionalEntityManager?: EntityManager,
  ): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();

    const permissions =
      effectivePermissions ??
      (user as AuthenticatedUser).effectivePermissions ??
      (await this.rbacService.getEffectivePermissions(user.id));
    if (permissions.has('resources.maintenance.manage')) return new Set(resourceIds);

    try {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;
      const matches = await resourceIntroducerRepository
        .createQueryBuilder('introducer')
        .leftJoin('introducer.resource', 'resource')
        .leftJoin('introducer.resourceGroup', 'resourceGroup')
        .leftJoin('resourceGroup.resources', 'groupResource')
        .select('resource.id', 'resourceId')
        .addSelect('groupResource.id', 'groupResourceId')
        .where('introducer.userId = :userId', { userId: user.id })
        .andWhere('(resource.id IN (:...resourceIds) OR groupResource.id IN (:...resourceIds))', { resourceIds })
        .getRawMany<{ resourceId: number | null; groupResourceId: number | null }>();

      return new Set(
        matches.flatMap((match) =>
          [match.resourceId, match.groupResourceId].filter((id): id is number => id != null).map(Number),
        ),
      );
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return new Set();
    }
  }

  /**
   * Check if a user can manage maintenance for a specific resource
   */
  async canManageMaintenance(
    user: User | AuthenticatedUser,
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    // Check if the user has system permissions to manage all resources.
    // Fall back to a DB lookup when the entity came from a WebSocket/card path (no effectivePermissions attached).
    const effectivePermissions =
      (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
    if (effectivePermissions.has('resources.maintenance.manage')) {
      return true;
    }

    try {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;

      // First, check if the user is an introducer for this specific resource
      const resourceIntroducer = await resourceIntroducerRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          resource: {
            id: resourceId,
          },
        },
      });

      if (resourceIntroducer) {
        return true;
      }

      const resourceRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(Resource)
        : this.resourceRepository;

      // If not a direct resource introducer, check if the user is an introducer for any group the resource belongs to
      const resource = await resourceRepository.findOne({
        where: { id: resourceId },
        relations: ['groups'],
      });

      if (!resource) {
        this.logger.warn(`Resource ${resourceId} not found`);
        return false;
      }

      // Check if user is introducer for any of the resource's groups
      const groupIntroducer = await resourceIntroducerRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          resourceGroup: {
            id: In(resource.groups.map((group) => group.id)),
          },
        },
      });

      if (groupIntroducer) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return false;
    }
  }
}
