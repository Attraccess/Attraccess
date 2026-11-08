import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

describe('ResourceMaintenanceService change events and windows', () => {
  const fixture = registerMaintenanceServiceFixture();
  const emit = () => (fixture.service as unknown as { eventEmitter: { emit: jest.Mock } }).eventEmitter.emit;

  it('announces a manually created maintenance as created', async () => {
    jest.spyOn(fixture.resourceRepository, 'findOne').mockResolvedValue(fixture.mockResource);
    jest.spyOn(fixture.maintenanceRepository, 'create').mockReturnValue(fixture.mockMaintenance);
    jest.spyOn(fixture.maintenanceRepository, 'save').mockResolvedValue(fixture.mockMaintenance);

    await fixture.service.createMaintenance(1, { startTime: new Date().toISOString() } as never);

    expect(emit()).toHaveBeenCalledWith(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(1, fixture.mockMaintenance.id, 'created'),
    );
  });

  it('announces scheduled maintenance as created', () => {
    fixture.service.emitScheduledMaintenanceCreated(1, 5);
    expect(emit()).toHaveBeenCalledWith(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      expect.objectContaining({ resourceId: 1, maintenanceId: 5, action: 'created' }),
    );
  });

  it('announces a finished maintenance as finished', async () => {
    const open = { ...fixture.mockMaintenance, resourceId: 1, endTime: null };
    jest.spyOn(fixture.maintenanceRepository, 'findOne').mockResolvedValue(open);
    jest.spyOn(fixture.maintenanceRepository, 'save').mockImplementation(async (value) => value);

    await fixture.service.finishMaintenance(1);

    expect(emit()).toHaveBeenCalledWith(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      expect.objectContaining({ resourceId: 1, maintenanceId: 1, action: 'finished' }),
    );
  });

  it('finds maintenance overlapping a range, treating a missing end as open-ended', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([fixture.mockMaintenance]),
    };
    jest.spyOn(fixture.maintenanceRepository, 'createQueryBuilder').mockReturnValue(query as never);
    const from = new Date('2030-01-01T00:00:00Z');
    const to = new Date('2030-01-02T00:00:00Z');

    await expect(fixture.service.findOverlappingMaintenances(1, from, to)).resolves.toEqual([fixture.mockMaintenance]);

    expect(query.where).toHaveBeenCalledWith('maintenance.resourceId = :resourceId', { resourceId: 1 });
    expect(query.andWhere).toHaveBeenCalledWith('maintenance.startTime < :to', { to });
    expect(query.andWhere).toHaveBeenCalledWith('(maintenance.endTime IS NULL OR maintenance.endTime > :from)', {
      from,
    });
  });
});
