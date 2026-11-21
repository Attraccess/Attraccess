import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { createFakeContext } from './fake-context.test-utils';
import { WallStatusService } from './wall-status.service';

const at = (time: string) => new Date(`2026-11-21T${time}:00.000Z`);

function setup() {
  const fake = createFakeContext();
  const service = new WallStatusService(fake.context, () => at('10:00'));
  fake.state.resources = [
    { id: 1, name: 'Bandsaw', imageUrl: '/cdn/resources/1/original/saw.webp' },
    { id: 2, name: 'Laser', imageUrl: null },
    { id: 3, name: 'Lathe', imageUrl: null },
  ];
  return { ...fake, service };
}

describe('WallStatusService', () => {
  it('shows maintenance before use, and ready otherwise, with the start of the current state', async () => {
    const { service, state } = setup();
    state.sessions.set(1, [{ usageId: 9, userId: 4, startTime: at('09:30') }]);
    state.sessions.set(2, [
      { usageId: 10, userId: 5, startTime: at('09:50') },
      { usageId: 11, userId: 6, startTime: at('09:10') },
    ]);
    state.maintenance.set(2, [
      { maintenanceId: 1, resourceId: 2, startTime: at('08:00'), endTime: null, reason: 'Broken lens' },
    ]);

    expect(await service.tiles(undefined)).toEqual([
      { id: 1, name: 'Bandsaw', imageUrl: '/cdn/resources/1/original/saw.webp', state: 'in-use', since: at('09:30') },
      { id: 2, name: 'Laser', imageUrl: null, state: 'maintenance', since: at('08:00') },
      { id: 3, name: 'Lathe', imageUrl: null, state: 'ready', since: null },
    ]);
  });

  it('never exposes who uses a machine or why it is under maintenance', async () => {
    const { service, state } = setup();
    state.sessions.set(1, [{ usageId: 9, userId: 4, startTime: at('09:30') }]);
    state.maintenance.set(2, [{ maintenanceId: 1, resourceId: 2, startTime: at('08:00'), endTime: null, reason: 'x' }]);

    for (const tile of await service.tiles(undefined)) {
      expect(Object.keys(tile).sort()).toEqual(['id', 'imageUrl', 'name', 'since', 'state']);
    }
  });

  it('asks only for the wall resources and checks maintenance at this moment', async () => {
    const { service, context } = setup();

    const tiles = await service.tiles([3]);

    expect(tiles.map((tile) => tile.id)).toEqual([3]);
    expect(context.hostData.resources.listDisplay).toHaveBeenCalledWith([3]);
    expect(context.resourceAccess.getMaintenanceWindows).toHaveBeenCalledWith(
      3,
      at('10:00'),
      new Date(at('10:00').getTime() + 1),
    );
  });

  it('reports the resource of every session and maintenance change until it is destroyed', () => {
    const { service, emit } = setup();
    const seen: number[] = [];
    service.onModuleInit();
    service.changes().subscribe((id) => seen.push(id));

    emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, 1);
    emit(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, 2);
    emit(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, 3);
    emit(SystemEvent.MAINTENANCE_CHANGED, 4);
    service.onModuleDestroy();
    emit(SystemEvent.MAINTENANCE_CHANGED, 5);

    expect(seen).toEqual([1, 2, 3, 4]);
  });
});
