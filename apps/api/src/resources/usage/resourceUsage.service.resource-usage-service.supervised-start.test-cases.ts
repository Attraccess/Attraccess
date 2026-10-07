import {
  Resource,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceSupervisedUsageStartedEvent } from './events/resource-usage.events';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';
export function registerSupervisedStartCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('supervised start', () => {
    const requester: User = { id: 1, username: 'requester' } as User;
    const supervisor: User = { id: 2, username: 'supervisor' } as User;

    const supervisedResource = (mode: SupervisionMode): Resource =>
      ({
        id: 1,
        name: 'Supervised Resource',
        allowTakeOver: false,
        type: ResourceType.Machine,
        supervisionMode: mode,
      }) as Resource;

    const mockSuccessfulSessionCreation = (supervisorUserId: number) => {
      const createdSession = {
        id: 1,
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
        supervisorUserId,
        user: { id: 1 } as User,
        resource: { id: 1 } as Resource,
      } as ResourceUsage;
      const finalizedSession = { ...createdSession, isFinalized: true };

      fixture.resourceUsageRepository.findOne
        .mockResolvedValueOnce(null) // getActiveSession
        .mockResolvedValueOnce(createdSession) // newly created session
        .mockResolvedValueOnce(finalizedSession) // finalized session for return
        .mockResolvedValueOnce(finalizedSession); // emitUsageEvent fetch

      const mockQueryBuilder = fixture.createMockQueryBuilder(null);
      (fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
      );
      return { finalizedSession, mockQueryBuilder };
    };

    it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
      const dto: StartUsageSessionDto = { notes: 'Supervised run' };
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(supervisor);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      const { finalizedSession, mockQueryBuilder } = mockSuccessfulSessionCreation(2);

      const result = await fixture.service.startSession(1, requester, dto, { supervisorUserId: 2 });

      expect(result).toEqual(finalizedSession);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ supervisorUserId: 2 }));

      const counterEmit = fixture.eventEmitter.emit.mock.calls.find(
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
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(adminSupervisor);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

      await expect(fixture.service.startSession(1, requester, dto, { supervisorUserId: 2 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      const dto: StartUsageSessionDto = {};
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(supervisor);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

      mockSuccessfulSessionCreation(2);

      await expect(fixture.service.startSession(1, requester, dto, { supervisorUserId: 2 })).resolves.toMatchObject({
        supervisorUserId: 2,
      });
    });

    it('rejects self-supervision', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);

      await expect(fixture.service.startSession(1, requester, {}, { supervisorUserId: requester.id })).rejects.toThrow(
        new BadRequestException('You cannot supervise your own session'),
      );
    });

    it('rejects a maintainer who is not also an introducer', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(supervisor);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);

      await expect(fixture.service.startSession(1, requester, {}, { supervisorUserId: 2 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('accepts an applicable Resource Group introducer', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(supervisor);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(true);
      mockSuccessfulSessionCreation(2);

      await expect(fixture.service.startSession(1, requester, {}, { supervisorUserId: 2 })).resolves.toMatchObject({
        supervisorUserId: 2,
      });
      expect(fixture.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(1, 2, true, expect.anything());
    });

    it('rejects a supervised start when the resource does not allow supervision', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.INTRODUCTION_REQUIRED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(supervisor);

      await expect(fixture.service.startSession(1, requester, {}, { supervisorUserId: 2 })).rejects.toThrow(
        new BadRequestException('This resource does not support supervised sessions'),
      );
    });

    it('rejects an unknown supervisor', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.userRepository.findOne.mockResolvedValue(null);

      await expect(fixture.service.startSession(1, requester, {}, { supervisorUserId: 999 })).rejects.toThrow(
        new NotFoundException('Supervisor with ID 999 not found'),
      );
    });

    it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);

      await expect(fixture.service.startSession(1, requester, {})).rejects.toThrow(
        new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
      );
    });
  });
}
