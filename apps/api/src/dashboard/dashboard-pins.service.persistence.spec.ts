import { BadRequestException } from '@nestjs/common';
import { DashboardPin, Resource, ResourceType, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { SqliteFileFixture } from '../database/adapters/sqlite-file.test-fixture';
import { TypeOrmDashboardPinStore } from '../database/adapters/dashboard/typeorm-dashboard-pin.store';
import { unitOfWorkFor } from '../database/adapters/shared-unit-of-work';
import { PluginService } from '../plugin-system/plugin.service';
import * as pluginsDisabled from '../plugin-system/plugins-disabled';
import { DashboardPinsService, MAX_DASHBOARD_PINS, StoredDashboardPin } from './dashboard-pins.service';

jest.setTimeout(60_000);

const page = (itemId: string): StoredDashboardPin => ({ itemType: 'page', itemId, size: null });
const resource = (itemId: string): StoredDashboardPin => ({ itemType: 'resource', itemId, size: null });
const widget = (itemId: string): StoredDashboardPin => ({ itemType: 'widget', itemId, size: null });

const serviceOn = (source: DataSource) => {
  const uow = unitOfWorkFor(source);
  return new DashboardPinsService(new TypeOrmDashboardPinStore(source, uow), uow);
};

describe('DashboardPinsService on real SQLite', () => {
  let fixture: SqliteFileFixture;
  let source: DataSource;
  let service: DashboardPinsService;
  let userId: number;
  let otherUserId: number;

  const createResource = (name: string) =>
    source.getRepository(Resource).save({ name, type: ResourceType.Machine } as Resource);
  const ids = async (forUser = userId) => (await service.getPins(forUser)).map(({ itemId }) => itemId);

  beforeEach(async () => {
    fixture = await SqliteFileFixture.create();
    source = await fixture.open();
    const users = source.getRepository(User);
    userId = (await users.save({ username: 'pinner', email: 'pinner@example.com' } as User)).id;
    otherUserId = (await users.save({ username: 'other', email: 'other@example.com' } as User)).id;
    service = serviceOn(source);
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(false);
    jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([]);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture.close();
  });

  it('starts with no pins', async () => {
    expect(await service.getPins(userId)).toEqual([]);
  });

  it('adds, moves and removes pins in a stored order', async () => {
    for (const path of ['/projects', '/messages', '/settings']) {
      await service.updatePins(userId, { kind: 'add', item: page(path) });
    }
    expect(
      await service.updatePins(userId, { kind: 'move', item: page('/settings'), before: page('/projects') }),
    ).toEqual([page('/settings'), page('/projects'), page('/messages')]);
    await service.updatePins(userId, { kind: 'remove', item: page('/projects') });
    expect(await ids()).toEqual(['/settings', '/messages']);
  });

  it('keeps every write when several arrive at once on one connection', async () => {
    const paths = ['/projects', '/messages', '/settings', '/users', '/billing'];
    await Promise.all(paths.map((path) => service.updatePins(userId, { kind: 'add', item: page(path) })));
    expect((await ids()).sort()).toEqual([...paths].sort());
  });

  it('keeps every write when two independent connections add pins at the same time', async () => {
    const second = await fixture.open();
    const services = [service, serviceOn(second)];
    const paths = ['/resources', '/projects', '/messages', '/settings', '/users', '/billing', '/printables', '/balena'];
    await Promise.all(
      paths.map((path, index) => services[index % 2].updatePins(userId, { kind: 'add', item: page(path) })),
    );
    expect((await ids()).sort()).toEqual([...paths].sort());
    expect((await serviceOn(second).getPins(userId)).map(({ itemId }) => itemId).sort()).toEqual([...paths].sort());
    const stored = await source.getRepository(DashboardPin).find({ where: { userId }, order: { position: 'ASC' } });
    expect(stored.map(({ position }) => position)).toEqual(paths.map((_, position) => position));
  });

  it('applies concurrent moves from two connections to a consistent, complete list', async () => {
    const second = await fixture.open();
    const widgets = ['messages', 'resources', 'users', 'my-sessions'];
    for (const id of widgets) await service.updatePins(userId, { kind: 'add', item: widget(id) });
    await Promise.all([
      service.updatePins(userId, { kind: 'move', item: widget('users'), before: widget('messages') }),
      serviceOn(second).updatePins(userId, { kind: 'resize', item: widget('resources'), size: 'large' }),
      service.updatePins(userId, { kind: 'remove', item: widget('my-sessions') }),
    ]);
    const final = await service.getPins(userId);
    expect(final.map(({ itemId }) => itemId).sort()).toEqual(['messages', 'resources', 'users']);
    expect(final.find(({ itemId }) => itemId === 'resources')?.size).toBe('large');
  });

  it('never reads or writes the pins of another user', async () => {
    await service.updatePins(userId, { kind: 'add', item: page('/projects') });
    await service.updatePins(otherUserId, { kind: 'add', item: page('/messages') });
    await service.updatePins(otherUserId, { kind: 'remove', item: page('/projects') });
    expect(await ids()).toEqual(['/projects']);
    expect(await ids(otherUserId)).toEqual(['/messages']);
  });

  it.each(['/dashboard', '/kiosk/companion', '/resources/1', '/does-not-exist', '/plugin-report'])(
    'rejects adding the page %s',
    async (path) => {
      await expect(service.updatePins(userId, { kind: 'add', item: page(path) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('accepts dashboard paths of active plugins only', async () => {
    const plugin = {
      status: 'unknown',
      pluginDirectory: '/plugins/report',
      main: { frontend: { dashboardPaths: ['/plugin-report'] } },
    };
    const plugins = jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([plugin as never]);
    await service.updatePins(userId, { kind: 'add', item: page('/plugin-report') });
    expect(await ids()).toEqual(['/plugin-report']);

    const rejected = () => service.updatePins(userId, { kind: 'add', item: page('/plugin-report-2') });
    plugins.mockReturnValue([
      { ...plugin, status: 'error', main: { frontend: { dashboardPaths: ['/plugin-report-2'] } } } as never,
    ]);
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
    plugins.mockReturnValue([{ ...plugin, main: { frontend: { dashboardPaths: ['/plugin-report-2'] } } } as never]);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(true);
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(true);
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still removes and moves a page that can no longer be pinned', async () => {
    await source.getRepository(DashboardPin).insert([
      { userId, itemType: 'page', itemId: '/uninstalled-plugin', position: 0 },
      { userId, itemType: 'page', itemId: '/projects', position: 1 },
    ]);
    await service.updatePins(userId, { kind: 'move', item: page('/projects'), before: page('/uninstalled-plugin') });
    expect(await ids()).toEqual(['/projects', '/uninstalled-plugin']);
    await service.updatePins(userId, { kind: 'remove', item: page('/uninstalled-plugin') });
    expect(await ids()).toEqual(['/projects']);
  });

  it('adds, moves and removes built-in widgets beside pages', async () => {
    await service.updatePins(userId, { kind: 'add', item: page('/projects') });
    await service.updatePins(userId, { kind: 'add', item: widget('messages') });
    await service.updatePins(userId, { kind: 'add', item: widget('my-sessions') });
    expect(
      await service.updatePins(userId, { kind: 'move', item: widget('my-sessions'), before: page('/projects') }),
    ).toEqual([widget('my-sessions'), page('/projects'), widget('messages')]);
    await service.updatePins(userId, { kind: 'remove', item: widget('messages') });
    expect(await ids()).toEqual(['my-sessions', '/projects']);
  });

  it('stores the size given on add or resize and returns it', async () => {
    await service.updatePins(userId, { kind: 'add', item: widget('messages'), size: 'small' });
    await service.updatePins(userId, { kind: 'add', item: widget('my-sessions') });
    expect(await service.getPins(userId)).toEqual([{ ...widget('messages'), size: 'small' }, widget('my-sessions')]);

    expect(await service.updatePins(userId, { kind: 'resize', item: widget('my-sessions'), size: 'large' })).toEqual([
      { ...widget('messages'), size: 'small' },
      { ...widget('my-sessions'), size: 'large' },
    ]);
    // Moving keeps the size.
    await service.updatePins(userId, { kind: 'move', item: widget('my-sessions'), before: widget('messages') });
    expect(await service.getPins(userId)).toEqual([
      { ...widget('my-sessions'), size: 'large' },
      { ...widget('messages'), size: 'small' },
    ]);
  });

  it('ignores resizing an item that is not pinned', async () => {
    await service.updatePins(userId, { kind: 'add', item: widget('messages') });
    expect(await service.updatePins(userId, { kind: 'resize', item: widget('users'), size: 'large' })).toEqual([
      widget('messages'),
    ]);
  });

  it('rejects adding an unknown widget', async () => {
    await expect(service.updatePins(userId, { kind: 'add', item: widget('weather') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts widgets declared by active plugins only', async () => {
    const plugin = {
      status: 'unknown',
      pluginDirectory: '/plugins/reservations',
      main: { frontend: { dashboardWidgets: ['reservations-upcoming'] } },
    };
    const plugins = jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([plugin as never]);
    await service.updatePins(userId, { kind: 'add', item: widget('reservations-upcoming') });
    expect(await ids()).toEqual(['reservations-upcoming']);

    const rejected = () => service.updatePins(userId, { kind: 'add', item: widget('reservations-manage') });
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
    plugins.mockReturnValue([
      { ...plugin, status: 'error', main: { frontend: { dashboardWidgets: ['reservations-manage'] } } } as never,
    ]);
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
    plugins.mockReturnValue([
      { ...plugin, main: { frontend: { dashboardWidgets: ['reservations-manage'] } } } as never,
    ]);
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(true);
    await expect(rejected()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still removes a widget whose plugin is gone', async () => {
    await source
      .getRepository(DashboardPin)
      .insert([{ userId, itemType: 'widget', itemId: 'gone-widget', position: 0 }]);
    await service.updatePins(userId, { kind: 'remove', item: widget('gone-widget') });
    expect(await ids()).toEqual([]);
  });

  it('pins existing resources with their name and rejects missing ones', async () => {
    const lathe = await createResource('Lathe');
    expect(await service.updatePins(userId, { kind: 'add', item: resource(String(lathe.id)) })).toEqual([
      { ...resource(String(lathe.id)), resourceName: 'Lathe' },
    ]);
    await expect(service.updatePins(userId, { kind: 'add', item: resource('99999') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('drops pins of resources that no longer exist when reading', async () => {
    const lathe = await createResource('Lathe');
    await service.updatePins(userId, { kind: 'add', item: page('/projects') });
    await service.updatePins(userId, { kind: 'add', item: resource(String(lathe.id)) });
    await source.getRepository(Resource).softDelete(lathe.id);

    expect(await ids()).toEqual(['/projects']);
    expect(await source.getRepository(DashboardPin).count({ where: { userId } })).toBe(1);
  });

  it(`refuses more than ${MAX_DASHBOARD_PINS} pins`, async () => {
    await source.getRepository(DashboardPin).insert(
      Array.from({ length: MAX_DASHBOARD_PINS }, (_, position) => ({
        userId,
        itemType: 'page' as const,
        itemId: `/stored-${position}`,
        position,
      })),
    );
    await expect(service.updatePins(userId, { kind: 'add', item: page('/projects') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await source.getRepository(DashboardPin).count({ where: { userId } })).toBe(MAX_DASHBOARD_PINS);
  });
});
