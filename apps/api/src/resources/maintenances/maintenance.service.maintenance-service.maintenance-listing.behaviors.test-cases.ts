import { BadRequestException, NotFoundException } from '@nestjs/common';
import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';

export function registerMaintenanceListingCases(fixture: ReturnType<typeof registerMaintenanceServiceFixture>) {
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
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerMaintenanceServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}
