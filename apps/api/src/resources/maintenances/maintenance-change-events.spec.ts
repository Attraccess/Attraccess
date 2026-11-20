import { registerMaintenanceServiceFixture } from './maintenance.service.maintenance-service.test-fixture';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

describe('ResourceMaintenanceService change events and windows', () => {
  const fixture = registerMaintenanceServiceFixture();
  const emit = () => fixture.eventEmitter.emit;

  it('announces a manually created maintenance as created', async () => {
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
    fixture.store.findById.mockResolvedValue({ ...fixture.mockMaintenance, resourceId: 1, endTime: null });

    await fixture.service.finishMaintenance(1);

    expect(emit()).toHaveBeenCalledWith(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      expect.objectContaining({ resourceId: 1, maintenanceId: 1, action: 'finished' }),
    );
  });

  it('finds maintenance overlapping a range through the store', async () => {
    fixture.store.findOverlapping.mockResolvedValue([fixture.mockMaintenance]);
    const from = new Date('2030-01-01T00:00:00Z');
    const to = new Date('2030-01-02T00:00:00Z');

    await expect(fixture.service.findOverlappingMaintenances(1, from, to)).resolves.toEqual([fixture.mockMaintenance]);

    expect(fixture.store.findOverlapping).toHaveBeenCalledWith(1, from, to);
  });
});
