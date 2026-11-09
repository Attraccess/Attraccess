import { SupervisionMode, User } from '@attraccess/database-entities';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { ResourceSupervisedUsageStartedEvent } from '../events/resource-usage.events';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createResourceUsageServiceFixture } from './fixtures/service.test-fixture';

import { createSupervisedStartFixture } from './fixtures/supervised-start.test-fixture';

import { mockRbacService } from './fixtures/rbac.test-fixture';

describe('ResourceUsageService', () => {
  const scope = createResourceUsageServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });

  describe('supervised start', () => {
    const supervisedStartScope = createSupervisedStartFixture(scope);

    it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
      const dto: StartUsageSessionDto = { notes: 'Supervised run' };
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      const { finalizedSession, mockQueryBuilder } = supervisedStartScope.mockSuccessfulSessionCreation(2);

      const result = await supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, {
        supervisorUserId: 2,
      });

      expect(result).toEqual(finalizedSession);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ supervisorUserId: 2 }));

      const counterEmit = supervisedStartScope.eventEmitter.emit.mock.calls.find(
        (c) => c[0] === ResourceSupervisedUsageStartedEvent.EVENT_NAME,
      );
      expect(counterEmit).toBeDefined();
      const payload = counterEmit?.[1] as ResourceSupervisedUsageStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSupervisedUsageStartedEvent);
      expect(payload).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2 });
    });

    it('rejects a resource manager who is not also an introducer', async () => {
      const dto: StartUsageSessionDto = {};
      const adminSupervisor = { id: 2, username: 'admin' } as User;
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(adminSupervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      supervisedStartScope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, { supervisorUserId: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      const dto: StartUsageSessionDto = {};
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      supervisedStartScope.mockSuccessfulSessionCreation(2);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, dto, { supervisorUserId: 2 }),
      ).resolves.toMatchObject({
        supervisorUserId: 2,
      });
    });

    it('rejects self-supervision', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);

      await expect(
        supervisedStartScope.service.startSession(
          1,
          supervisedStartScope.requester,
          {},
          { supervisorUserId: supervisedStartScope.requester.id },
        ),
      ).rejects.toThrow(new BadRequestException('You cannot supervise your own session'));
    });

    it('rejects a maintainer who is not also an introducer', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts an applicable Resource Group introducer', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);
      supervisedStartScope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);
      supervisedStartScope.mockSuccessfulSessionCreation(2);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).resolves.toMatchObject({
        supervisorUserId: 2,
      });
      expect(supervisedStartScope.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(
        1,
        2,
        true,
        expect.anything(),
      );
    });

    it('rejects a supervised start when the resource does not allow supervision', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.INTRODUCTION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(supervisedStartScope.supervisor);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 2 }),
      ).rejects.toThrow(new BadRequestException('This resource does not support supervised sessions'));
    });

    it('rejects an unknown supervisor', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.userRepository.findOne.mockResolvedValue(null);

      await expect(
        supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {}, { supervisorUserId: 999 }),
      ).rejects.toThrow(new NotFoundException('Supervisor with ID 999 not found'));
    });

    it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      supervisedStartScope.resourceRepository.findOne.mockResolvedValue(
        supervisedStartScope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED),
      );
      supervisedStartScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      supervisedStartScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);

      await expect(supervisedStartScope.service.startSession(1, supervisedStartScope.requester, {})).rejects.toThrow(
        new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
      );
    });
  });
});
