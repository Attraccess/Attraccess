import { HttpException, NotFoundException, type MessageEvent } from '@nestjs/common';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { firstValueFrom, take, toArray } from 'rxjs';
import { createFakeContext } from './fake-context.test-utils';
import { PUBLIC_RATE_LIMIT, PublicWallController } from './public.controller';
import { WallSnapshotService } from './wall-snapshot.service';
import { WallStatusService } from './wall-status.service';
import { WallsService } from './walls.service';

async function setup() {
  const fake = createFakeContext();
  const clock = () => new Date('2026-11-21T10:00:00.000Z');
  const walls = new WallsService(fake.context, clock);
  const status = new WallStatusService(fake.context, clock);
  const snapshots = new WallSnapshotService(walls, status, clock);
  status.onModuleInit();
  snapshots.onModuleInit();
  const controller = new PublicWallController(walls, snapshots, status, clock);
  fake.state.resources = [
    { id: 1, name: 'Laser', imageUrl: null },
    { id: 2, name: 'Lathe', imageUrl: null },
  ];
  const wall = await walls.create(1, { name: 'Hall', selection: { all: false, resourceIds: [1], groupIds: [] } });
  const response = {
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return { ...fake, controller, wall, walls, response };
}

describe('PublicWallController', () => {
  it('serves the snapshot of the wall behind the token, without any session', async () => {
    const { controller, wall, response } = await setup();

    await expect(controller.snapshot(wall.token, { ip: '10.0.0.1' }, response)).resolves.toMatchObject({
      name: 'Hall',
      tiles: [{ id: 1, name: 'Laser', state: 'ready' }],
    });
  });

  it('answers 404 alike for malformed, unknown and replaced tokens', async () => {
    const { controller, wall, walls, response } = await setup();
    await walls.regenerateToken(wall.id);

    for (const token of ['nope', 'A'.repeat(43), wall.token]) {
      await expect(controller.snapshot(token, { ip: '10.0.0.1' }, response)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('limits requests per address and wall, telling the screen when to retry', async () => {
    const { controller, wall, response } = await setup();
    for (let i = 0; i < PUBLIC_RATE_LIMIT.perWallPerMinute; i++) {
      await controller.snapshot(wall.token, { ip: '10.0.0.1' }, response);
    }

    const refused = controller.snapshot(wall.token, { ip: '10.0.0.1' }, response);

    await expect(refused).rejects.toBeInstanceOf(HttpException);
    await expect(refused).rejects.toMatchObject({ status: 429 });
    expect(response.headers['Retry-After']).toBe('60');
    // Another screen on another address is not affected.
    await expect(controller.snapshot(wall.token, { ip: '10.0.0.2' }, response)).resolves.toBeDefined();
  });

  it('streams a change event only for resources on the wall', async () => {
    const { controller, wall, response, emit } = await setup();
    const stream = await controller.events(wall.token, { ip: '10.0.0.1' }, response);
    const received = firstValueFrom(stream.pipe(take(1), toArray()));

    emit(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, 2);
    emit(SystemEvent.MAINTENANCE_CHANGED, 1);

    expect(await received).toEqual<MessageEvent[]>([{ type: 'changed', data: { resourceId: 1 } }]);
  });

  it('refuses the event stream for an unknown token', async () => {
    const { controller, response } = await setup();

    await expect(controller.events('A'.repeat(43), { ip: '10.0.0.1' }, response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
