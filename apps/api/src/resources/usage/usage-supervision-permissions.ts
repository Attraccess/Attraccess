import { Resource, SupervisionMode, User } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { UsageControlPermissionsImplementation } from './usage-control-permissions';
export abstract class UsageSupervisionPermissionsImplementation extends UsageControlPermissionsImplementation {
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
}
