import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Resource } from '@attraccess/database-entities';

describe('MaintenanceService', () => {
  const fixture = registerMaintenanceServiceFixture();

  it('creates scheduled maintenance with deferred notifications in a transaction', async () => {
    jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
    jest.spyOn(fixture.maintenanceRepository, 'create').mockReturnValue(fixture.mockMaintenance);
    jest.spyOn(fixture.maintenanceRepository, 'save').mockResolvedValue(fixture.mockMaintenance);
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Resource ? fixture.resourceRepository : fixture.maintenanceRepository,
    };
    const emit = jest.spyOn(fixture.service, 'emitScheduledMaintenanceCreated');
    expect(await fixture.service.createMaintenanceFromSchedule(1, 8, 'Due', manager as never, false)).toBe(
      fixture.mockMaintenance,
    );
    expect(fixture.maintenanceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ maintenanceSchedule: { id: 8 }, endTime: null, reason: 'Due' }),
    );
    expect(emit).not.toHaveBeenCalled();
    await fixture.service.createMaintenanceFromSchedule(1, 8, 'Due');
    expect(emit).toHaveBeenCalledWith(1, 1);
    jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(null);
    await expect(fixture.service.createMaintenanceFromSchedule(99, 8, 'Due')).rejects.toThrow('not found');
  });

  it('checks active maintenance by resource or schedule through the supplied transaction', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(fixture.mockMaintenance),
    };
    jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(query as never);
    expect(await fixture.service.hasActiveMaintenance(1)).toBe(true);
    expect(query.where).toHaveBeenCalledWith('maintenance.resourceId = :resourceId', { resourceId: 1 });
    query.getOne.mockResolvedValue(null);
    const manager = { getRepository: () => fixture.maintenanceRepository };
    expect(await fixture.service.hasActiveMaintenance({ resourceId: 1, scheduleId: 8 }, manager as never)).toBe(false);
    expect(query.andWhere).toHaveBeenCalledWith('maintenance.maintenanceScheduleId = :scheduleId', { scheduleId: 8 });
  });

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('maintenance listing', () => {
    it.each([
      [true, false, false, 'maintenance.startTime > :now'],
      [false, true, false, 'maintenance.endTime IS NULL'],
      [false, false, true, 'maintenance.endTime < :now'],
      [true, true, true, null],
    ])(
      'filters upcoming=%s active=%s past=%s before pagination',
      async (includeUpcoming, includeActive, includePast, condition) => {
        jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
        const query = fixture.maintenanceRepository.createQueryBuilder();
        jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(query);
        jest.spyOn(query, 'getCount').mockResolvedValue(11);
        jest.spyOn(query, 'getMany').mockResolvedValue([fixture.mockMaintenance]);
        expect(
          await fixture.service.findMaintenances(1, { page: 2, limit: 5, includeUpcoming, includeActive, includePast }),
        ).toEqual({ data: [fixture.mockMaintenance], total: 11, page: 2, limit: 5 });
        expect(query.where).toHaveBeenCalledWith('maintenance.resourceId = :resourceId', { resourceId: 1 });
        if (condition)
          expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining(condition), { now: expect.any(Date) });
        else expect(query.andWhere).not.toHaveBeenCalled();
        expect(query.skip).toHaveBeenCalledWith(5);
        expect(query.take).toHaveBeenCalledWith(5);
        expect(query.leftJoinAndSelect).toHaveBeenCalledWith('maintenance.completedByUser', 'completedByUser');
      },
    );

    it('rejects missing resources and an empty filter selection', async () => {
      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(null);
      await expect(fixture.service.findMaintenances(99)).rejects.toBeInstanceOf(NotFoundException);
      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
      await expect(
        fixture.service.findMaintenances(1, { includeUpcoming: false, includeActive: false, includePast: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('individual maintenance access', () => {
    it('accepts global and direct permissions without needing resource groups', async () => {
      const user = { id: 7, effectivePermissions: new Set(['resources.maintenance.manage']) } as Parameters<
        typeof fixture.service.canManageMaintenance
      >[0];
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(true);
      expect(fixture.resourceIntroducerRepository.findOne).not.toHaveBeenCalled();
      jest.spyOn(fixture.resourceIntroducerRepository, 'findOne').mockResolvedValue({ id: 2 });
      expect(await fixture.service.canManageMaintenance({ ...user, effectivePermissions: new Set() }, 1)).toBe(true);
      expect(fixture.resourceRepository.findOne).not.toHaveBeenCalled();
    });

    it('checks resource group introductions and denies missing or failed lookups', async () => {
      const user = { id: 7 } as Parameters<typeof fixture.service.canManageMaintenance>[0];
      jest
        .spyOn(fixture.resourceIntroducerRepository, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 4 });
      jest
        .spyOn(fixture.resourceRepository, 'findOne')
        .mockResolvedValue({ ...fixture.mockResource, groups: [{ id: 3 }] });
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(true);
      expect(fixture.resourceIntroducerRepository.findOne).toHaveBeenLastCalledWith({
        where: { user: { id: 7 }, resourceGroup: { id: expect.objectContaining({ _value: [3] }) } },
      });
      jest.spyOn(fixture.resourceIntroducerRepository, 'findOne').mockResolvedValue(null);
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(null);
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(fixture.resourceIntroducerRepository, 'findOne').mockRejectedValue(new Error('Database unavailable'));
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
    });
  });

  describe('createMaintenance', () => {
    it('should create a maintenance successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const dto = {
        startTime: futureDate.toISOString(),
        reason: 'Test maintenance',
      };

      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
      jest.spyOn(fixture.maintenanceRepository, 'create').mockReturnValue(fixture.mockMaintenance);
      jest.spyOn(fixture.maintenanceRepository, 'save').mockResolvedValue(fixture.mockMaintenance);

      const result = await fixture.service.createMaintenance(1, dto);

      expect(result).toEqual(fixture.mockMaintenance);
      expect(fixture.resourceRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw error if resource not found', async () => {
      const dto = {
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(null);

      await expect(fixture.service.createMaintenance(999, dto)).rejects.toThrow(
        new NotFoundException('Resource with ID 999 not found'),
      );
    });

    it('should create maintenance with past start time', async () => {
      const dto = {
        startTime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        reason: 'Test maintenance with past start time',
      };

      jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
      jest.spyOn(fixture.maintenanceRepository, 'create').mockReturnValue(fixture.mockMaintenance);
      jest.spyOn(fixture.maintenanceRepository, 'save').mockResolvedValue(fixture.mockMaintenance);

      const result = await fixture.service.createMaintenance(1, dto);

      expect(result).toEqual(fixture.mockMaintenance);
      expect(fixture.resourceRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('finishMaintenance', () => {
    it('should finish a maintenance successfully', async () => {
      const maintenance = { ...fixture.mockMaintenance, endTime: null };
      const finishedMaintenance = { ...maintenance, endTime: new Date() };

      jest.spyOn(fixture.maintenanceRepository, 'findOne').mockResolvedValue(maintenance);
      jest.spyOn(fixture.maintenanceRepository, 'save').mockResolvedValue(finishedMaintenance);

      const result = await fixture.service.finishMaintenance(1);

      expect(result.endTime).toBeDefined();
      expect(fixture.maintenanceRepository.save).toHaveBeenCalled();
    });

    it('should throw error if maintenance not found', async () => {
      jest.spyOn(fixture.maintenanceRepository, 'findOne').mockResolvedValue(null);

      await expect(fixture.service.finishMaintenance(999)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found'),
      );
    });

    it('should throw error if maintenance already finished', async () => {
      const finishedMaintenance = { ...fixture.mockMaintenance, endTime: new Date() };

      jest.spyOn(fixture.maintenanceRepository, 'findOne').mockResolvedValue(finishedMaintenance);

      await expect(fixture.service.finishMaintenance(1)).rejects.toThrow(
        new BadRequestException('Maintenance is already finished'),
      );
    });
  });

  describe('getMaintenanceManagedResourceIds', () => {
    it('returns all requested resources for global maintenance permission without role queries', async () => {
      await expect(
        fixture.service.getMaintenanceManagedResourceIds(
          { id: 7 } as never,
          [10, 20],
          new Set(['resources.maintenance.manage']),
        ),
      ).resolves.toEqual(new Set([10, 20]));
      expect(fixture.resourceIntroducerRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('batches direct and group maintenance roles for a resource list', async () => {
      const query = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { resourceId: 10, groupResourceId: null },
          { resourceId: null, groupResourceId: 20 },
        ]),
      };
      jest.spyOn(fixture.resourceIntroducerRepository, 'createQueryBuilder').mockReturnValue(query as never);

      await expect(fixture.service.getMaintenanceManagedResourceIds({ id: 7 } as never, [10, 20, 30])).resolves.toEqual(
        new Set([10, 20]),
      );

      expect(fixture.resourceIntroducerRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(query.andWhere).toHaveBeenCalledWith(
        '(resource.id IN (:...resourceIds) OR groupResource.id IN (:...resourceIds))',
        { resourceIds: [10, 20, 30] },
      );
    });
  });
});
