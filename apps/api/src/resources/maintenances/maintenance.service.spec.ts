import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('MaintenanceService', () => {
  const fixture = registerMaintenanceServiceFixture();

  it('creates scheduled maintenance with deferred notifications in a transaction', async () => {
    jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(fixture.mockResource);
    fixture.persistence.createMaintenance.mockResolvedValue(fixture.mockMaintenance as never);
    jest.spyOn(fixture.persistence, 'saveMaintenance').mockResolvedValue(fixture.mockMaintenance);
    const emit = jest.spyOn(fixture.service, 'emitScheduledMaintenanceCreated');
    expect(
      await fixture.transactionDriver.transactions.run({ resourceIds: [1], accountIds: [] }, (scope) =>
        fixture.service.createMaintenanceFromSchedule(1, 8, 'Due', scope, false),
      ),
    ).toEqual(fixture.mockMaintenance);
    expect(fixture.persistence.createMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({ maintenanceSchedule: { id: 8 }, endTime: null, reason: 'Due' }),
    );
    expect(emit).not.toHaveBeenCalled();
    await fixture.service.createMaintenanceFromSchedule(1, 8, 'Due');
    expect(emit).toHaveBeenCalledWith(1, 1);
    jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(null);
    await expect(fixture.service.createMaintenanceFromSchedule(99, 8, 'Due')).rejects.toThrow('not found');
  });

  it('checks active maintenance by resource or schedule through the supplied transaction', async () => {
    fixture.persistence.hasActive.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await fixture.service.hasActiveMaintenance(1)).toBe(true);
    expect(fixture.persistence.hasActive).toHaveBeenCalledWith(1, undefined, expect.any(Date));
    expect(
      await fixture.transactionDriver.transactions.run({ resourceIds: [1], accountIds: [] }, (scope) =>
        fixture.service.hasActiveMaintenance({ resourceId: 1, scheduleId: 8 }, scope),
      ),
    ).toBe(false);
    expect(fixture.persistence.hasActive).toHaveBeenLastCalledWith(1, 8, expect.any(Date));
  });

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('maintenance listing', () => {
    it.each([
      [true, false, false],
      [false, true, false],
      [false, false, true],
      [true, true, true],
    ])(
      'filters upcoming=%s active=%s past=%s before pagination',
      async (includeUpcoming, includeActive, includePast) => {
        jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(fixture.mockResource);
        fixture.persistence.page.mockResolvedValue([[fixture.mockMaintenance as never], 11]);
        expect(
          await fixture.service.findMaintenances(1, { page: 2, limit: 5, includeUpcoming, includeActive, includePast }),
        ).toEqual({ data: [fixture.mockMaintenance], total: 11, page: 2, limit: 5 });
        expect(fixture.persistence.page).toHaveBeenCalledWith(1, {
          now: expect.any(Date),
          includeUpcoming,
          includeActive,
          includePast,
          skip: 5,
          take: 5,
        });
      },
    );

    it('rejects missing resources and an empty filter selection', async () => {
      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(null);
      await expect(fixture.service.findMaintenances(99)).rejects.toBeInstanceOf(NotFoundException);
      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(fixture.mockResource);
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
      expect(fixture.persistence.directIntroducer).not.toHaveBeenCalled();
      fixture.persistence.directIntroducer.mockResolvedValue(true);
      expect(await fixture.service.canManageMaintenance({ ...user, effectivePermissions: new Set() }, 1)).toBe(true);
      expect(fixture.persistence.resource).not.toHaveBeenCalled();
    });

    it('checks resource group introductions and denies missing or failed lookups', async () => {
      const user = { id: 7 } as Parameters<typeof fixture.service.canManageMaintenance>[0];
      fixture.persistence.directIntroducer.mockResolvedValue(false);
      fixture.persistence.groupIntroducer.mockResolvedValueOnce(true).mockResolvedValue(false);
      jest
        .spyOn(fixture.persistence, 'resource')
        .mockResolvedValue({ ...fixture.mockResource, groups: [{ id: 3 } as never] });
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(true);
      expect(fixture.persistence.groupIntroducer).toHaveBeenLastCalledWith(7, [3]);
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(null);
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      jest.spyOn(fixture.persistence, 'directIntroducer').mockRejectedValue(new Error('Database unavailable'));
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

      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(fixture.mockResource);
      fixture.persistence.createMaintenance.mockResolvedValue(fixture.mockMaintenance as never);
      jest.spyOn(fixture.persistence, 'saveMaintenance').mockResolvedValue(fixture.mockMaintenance);

      const result = await fixture.service.createMaintenance(1, dto);

      expect(result).toEqual(fixture.mockMaintenance);
      expect(fixture.persistence.resource).toHaveBeenCalledWith(1);
    });

    it('should throw error if resource not found', async () => {
      const dto = {
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(null);

      await expect(fixture.service.createMaintenance(999, dto)).rejects.toThrow(
        new NotFoundException('Resource with ID 999 not found'),
      );
    });

    it('should create maintenance with past start time', async () => {
      const dto = {
        startTime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        reason: 'Test maintenance with past start time',
      };

      jest.spyOn(fixture.persistence, 'resource').mockResolvedValue(fixture.mockResource);
      fixture.persistence.createMaintenance.mockResolvedValue(fixture.mockMaintenance as never);
      jest.spyOn(fixture.persistence, 'saveMaintenance').mockResolvedValue(fixture.mockMaintenance);

      const result = await fixture.service.createMaintenance(1, dto);

      expect(result).toEqual(fixture.mockMaintenance);
      expect(fixture.persistence.resource).toHaveBeenCalledWith(1);
    });
  });

  describe('finishMaintenance', () => {
    it('should finish a maintenance successfully', async () => {
      const maintenance = { ...fixture.mockMaintenance, endTime: null };
      const finishedMaintenance = { ...maintenance, endTime: new Date() };

      jest.spyOn(fixture.persistence, 'maintenance').mockResolvedValue(maintenance);
      jest.spyOn(fixture.persistence, 'saveMaintenance').mockResolvedValue(finishedMaintenance);

      const result = await fixture.service.finishMaintenance(1);

      expect(result.endTime).toBeDefined();
      expect(fixture.persistence.saveMaintenance).toHaveBeenCalled();
    });

    it('should throw error if maintenance not found', async () => {
      jest.spyOn(fixture.persistence, 'maintenance').mockResolvedValue(null);

      await expect(fixture.service.finishMaintenance(999)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found'),
      );
    });

    it('should throw error if maintenance already finished', async () => {
      const finishedMaintenance = { ...fixture.mockMaintenance, endTime: new Date() };

      jest.spyOn(fixture.persistence, 'maintenance').mockResolvedValue(finishedMaintenance);

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
      expect(fixture.persistence.managedResourcePairs).not.toHaveBeenCalled();
    });

    it('batches direct and group maintenance roles for a resource list', async () => {
      fixture.persistence.managedResourcePairs.mockResolvedValue([
        { resourceId: 10, groupResourceId: null },
        { resourceId: null, groupResourceId: 20 },
      ]);

      await expect(fixture.service.getMaintenanceManagedResourceIds({ id: 7 } as never, [10, 20, 30])).resolves.toEqual(
        new Set([10, 20]),
      );

      expect(fixture.persistence.managedResourcePairs).toHaveBeenCalledTimes(1);
      expect(fixture.persistence.managedResourcePairs).toHaveBeenCalledWith(7, [10, 20, 30]);
    });
  });
});
