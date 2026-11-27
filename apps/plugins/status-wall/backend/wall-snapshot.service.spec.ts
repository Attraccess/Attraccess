import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { createFakeContext } from './fake-context.test-utils';
import { SNAPSHOT_TTL_MS, WallSnapshotService } from './wall-snapshot.service';
import { WallStatusService } from './wall-status.service';
import { WallsService } from './walls.service';

async function setup() {
  const fake = createFakeContext();
  let now = new Date('2026-11-21T10:00:00.000Z');
  const clock = () => now;
  const walls = new WallsService(fake.context, clock);
  const status = new WallStatusService(fake.context, clock);
  const snapshots = new WallSnapshotService(walls, status, clock);
  status.onModuleInit();
  snapshots.onModuleInit();
  fake.state.resources = [{ id: 1, name: 'Laser', imageUrl: null }];
  const wall = await walls.create(1, { name: 'Hall', selection: { all: true, resourceIds: [], groupIds: [] } });
  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  return { ...fake, snapshots, wall, advance };
}

describe('WallSnapshotService', () => {
  it('shares a snapshot between screens for a moment, then computes a new one', async () => {
    const { snapshots, wall, context, advance } = await setup();

    const first = await snapshots.snapshot(wall);
    await snapshots.snapshot(wall);
    expect(first).toMatchObject({ name: 'Hall', tiles: [{ id: 1, state: 'ready' }] });
    expect(context.hostData.resources.listDisplay).toHaveBeenCalledTimes(1);

    advance(SNAPSHOT_TTL_MS);
    await snapshots.snapshot(wall);
    expect(context.hostData.resources.listDisplay).toHaveBeenCalledTimes(2);
  });

  it('drops shared snapshots on every change', async () => {
    const { snapshots, wall, context, emit, state } = await setup();
    await snapshots.snapshot(wall);

    state.sessions.set(1, [{ usageId: 1, userId: 1, startTime: new Date('2026-11-21T09:00:00.000Z') }]);
    emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, 1);

    expect((await snapshots.snapshot(wall)).tiles[0].state).toBe('in-use');
    expect(context.hostData.resources.listDisplay).toHaveBeenCalledTimes(2);
  });

  it('does not share a failed computation', async () => {
    const { snapshots, wall, context } = await setup();
    jest.mocked(context.hostData.resources.listDisplay).mockRejectedValueOnce(new Error('db down'));

    await expect(snapshots.snapshot(wall)).rejects.toThrow('db down');
    await expect(snapshots.snapshot(wall)).resolves.toMatchObject({ name: 'Hall' });
  });
});
