import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { fakeTransactionScope } from '../../database/fake-transaction-scope.test-fixture';

describe('MaintenanceService', () => {
  const fixture = registerMaintenanceServiceFixture();

  it('creates scheduled maintenance with deferred notifications in a transaction', async () => {
    const context = fakeTransactionScope();
    const emit = jest.spyOn(fixture.service, 'emitScheduledMaintenanceCreated');
    expect(await fixture.service.createMaintenanceFromSchedule(1, 8, 'Due', context, false)).toBe(
      fixture.mockMaintenance,
    );
    expect(fixture.store.createFromSchedule).toHaveBeenCalledWith(
      { resourceId: 1, scheduleId: 8, reason: 'Due', startTime: expect.any(Date) },
      context,
    );
    expect(emit).not.toHaveBeenCalled();
    await fixture.service.createMaintenanceFromSchedule(1, 8, 'Due');
    expect(emit).toHaveBeenCalledWith(1, 1);
    fixture.store.createFromSchedule.mockResolvedValue(null);
    await expect(fixture.service.createMaintenanceFromSchedule(99, 8, 'Due')).rejects.toThrow('not found');
  });

  it('checks active maintenance by resource or schedule through the supplied transaction', async () => {
    fixture.store.hasActive.mockResolvedValue(true);
    expect(await fixture.service.hasActiveMaintenance(1)).toBe(true);
    expect(fixture.store.hasActive).toHaveBeenLastCalledWith({ resourceId: 1 }, expect.any(Date), undefined);
    fixture.store.hasActive.mockResolvedValue(false);
    const context = fakeTransactionScope();
    expect(await fixture.service.hasActiveMaintenance({ resourceId: 1, scheduleId: 8 }, context)).toBe(false);
    expect(fixture.store.hasActive).toHaveBeenLastCalledWith(
      { resourceId: 1, scheduleId: 8 },
      expect.any(Date),
      context,
    );
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
      'hands upcoming=%s active=%s past=%s and the page window to the store',
      async (includeUpcoming, includeActive, includePast) => {
        fixture.store.page.mockResolvedValue({ data: [fixture.mockMaintenance], total: 11 });
        expect(
          await fixture.service.findMaintenances(1, { page: 2, limit: 5, includeUpcoming, includeActive, includePast }),
        ).toEqual({ data: [fixture.mockMaintenance], total: 11, page: 2, limit: 5 });
        expect(fixture.store.page).toHaveBeenCalledWith(1, {
          includeUpcoming,
          includeActive,
          includePast,
          now: expect.any(Date),
          skip: 5,
          take: 5,
        });
      },
    );

    it('rejects missing resources and an empty filter selection', async () => {
      fixture.store.resourceExists.mockResolvedValue(false);
      await expect(fixture.service.findMaintenances(99)).rejects.toBeInstanceOf(NotFoundException);
      fixture.store.resourceExists.mockResolvedValue(true);
      await expect(
        fixture.service.findMaintenances(1, { includeUpcoming: false, includeActive: false, includePast: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.store.page).not.toHaveBeenCalled();
    });
  });

  describe('individual maintenance access', () => {
    it('accepts global and direct permissions without needing resource groups', async () => {
      const user = { id: 7, effectivePermissions: new Set(['resources.maintenance.manage']) } as Parameters<
        typeof fixture.service.canManageMaintenance
      >[0];
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(true);
      expect(fixture.store.lookupMaintenanceAccess).not.toHaveBeenCalled();
      fixture.store.lookupMaintenanceAccess.mockResolvedValue('direct');
      expect(await fixture.service.canManageMaintenance({ ...user, effectivePermissions: new Set() }, 1)).toBe(true);
    });

    it('accepts group introductions and denies missing or failed lookups', async () => {
      const user = { id: 7 } as Parameters<typeof fixture.service.canManageMaintenance>[0];
      fixture.store.lookupMaintenanceAccess.mockResolvedValue('group');
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(true);
      expect(fixture.store.lookupMaintenanceAccess).toHaveBeenLastCalledWith(7, 1, undefined);
      fixture.store.lookupMaintenanceAccess.mockResolvedValue('none');
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      fixture.store.lookupMaintenanceAccess.mockResolvedValue('resource-missing');
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
      fixture.store.lookupMaintenanceAccess.mockRejectedValue(new Error('Database unavailable'));
      expect(await fixture.service.canManageMaintenance(user, 1)).toBe(false);
    });
  });

  describe('createMaintenance', () => {
    it('should create a maintenance successfully and announce it', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const result = await fixture.service.createMaintenance(
        1,
        { startTime: futureDate.toISOString(), reason: 'Test' },
        5,
      );

      expect(result).toEqual(fixture.mockMaintenance);
      expect(fixture.store.createManual).toHaveBeenCalledWith({
        resourceId: 1,
        startTime: futureDate,
        endTime: null,
        reason: 'Test',
        createdByUserId: 5,
      });
      expect(fixture.eventEmitter.emit).toHaveBeenCalledWith(
        'resource.maintenance.changed',
        expect.objectContaining({ resourceId: 1, maintenanceId: 1, action: 'created' }),
      );
    });

    it('should throw error if resource not found', async () => {
      const dto = {
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      fixture.store.resourceExists.mockResolvedValue(false);

      await expect(fixture.service.createMaintenance(999, dto)).rejects.toThrow(
        new NotFoundException('Resource with ID 999 not found'),
      );
      expect(fixture.store.createManual).not.toHaveBeenCalled();
    });

    it('rejects an end time that is not after the start time', async () => {
      const startTime = new Date(Date.now() + 86400000).toISOString();
      await expect(fixture.service.createMaintenance(1, { startTime, endTime: startTime })).rejects.toThrow(
        new BadRequestException('End time must be after start time'),
      );
    });

    it('should create maintenance with past start time', async () => {
      const dto = {
        startTime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        reason: 'Test maintenance with past start time',
      };

      const result = await fixture.service.createMaintenance(1, dto);

      expect(result).toEqual(fixture.mockMaintenance);
    });
  });

  describe('finishMaintenance', () => {
    it('should finish a maintenance successfully', async () => {
      const finished = { ...fixture.mockMaintenance, endTime: new Date() };
      fixture.store.findById.mockResolvedValue(fixture.mockMaintenance);
      fixture.store.markFinished.mockResolvedValue(finished);

      const result = await fixture.service.finishMaintenance(1, { userId: 5 });

      expect(result.endTime).toBeDefined();
      expect(fixture.store.markFinished).toHaveBeenCalledWith(1, expect.any(Date), 5);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledWith(
        'resource.maintenance.changed',
        expect.objectContaining({ action: 'finished' }),
      );
    });

    it('should throw error if maintenance not found', async () => {
      fixture.store.findById.mockResolvedValue(null);

      await expect(fixture.service.finishMaintenance(999)).rejects.toThrow(
        new NotFoundException('Maintenance with ID 999 not found'),
      );
    });

    it('should throw error if maintenance already finished', async () => {
      fixture.store.findById.mockResolvedValue({ ...fixture.mockMaintenance, endTime: new Date() });

      await expect(fixture.service.finishMaintenance(1)).rejects.toThrow(
        new BadRequestException('Maintenance is already finished'),
      );
      expect(fixture.store.markFinished).not.toHaveBeenCalled();
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
      expect(fixture.store.introducerManagedResourceIds).not.toHaveBeenCalled();
    });

    it('asks the store once for the direct and group maintenance roles of a resource list', async () => {
      fixture.store.introducerManagedResourceIds.mockResolvedValue(new Set([10, 20]));

      await expect(fixture.service.getMaintenanceManagedResourceIds({ id: 7 } as never, [10, 20, 30])).resolves.toEqual(
        new Set([10, 20]),
      );

      expect(fixture.store.introducerManagedResourceIds).toHaveBeenCalledTimes(1);
      expect(fixture.store.introducerManagedResourceIds).toHaveBeenCalledWith(7, [10, 20, 30], undefined);
    });

    it('manages nothing when the role lookup fails', async () => {
      fixture.store.introducerManagedResourceIds.mockRejectedValue(new Error('Database unavailable'));
      await expect(fixture.service.getMaintenanceManagedResourceIds({ id: 7 } as never, [10])).resolves.toEqual(
        new Set(),
      );
    });
  });
});
