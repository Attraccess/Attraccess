import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { DashboardPin, Resource, ResourceType, User, entities } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection } from '../database/run-serialized-transaction';
import { PluginService } from '../plugin-system/plugin.service';
import * as pluginsDisabled from '../plugin-system/plugins-disabled';
import { DashboardPinsService, MAX_DASHBOARD_PINS, applyDashboardPinOperation } from './dashboard-pins.service';
import { DashboardPinItemDto } from './dtos/dashboard-pin.dto';

const page = (itemId: string): DashboardPinItemDto => ({ itemType: 'page', itemId });
const resource = (itemId: string): DashboardPinItemDto => ({ itemType: 'resource', itemId });

describe('applyDashboardPinOperation', () => {
  const pins = [page('/a'), page('/b'), page('/c')];

  it('appends an added item once', () => {
    expect(applyDashboardPinOperation(pins, { kind: 'add', item: page('/d') })).toEqual([...pins, page('/d')]);
    expect(applyDashboardPinOperation(pins, { kind: 'add', item: page('/a') })).toEqual(pins);
  });

  it('removes an item and ignores an unknown one', () => {
    expect(applyDashboardPinOperation(pins, { kind: 'remove', item: page('/b') })).toEqual([page('/a'), page('/c')]);
    expect(applyDashboardPinOperation(pins, { kind: 'remove', item: page('/x') })).toEqual(pins);
  });

  it('moves an item before another, or to the end', () => {
    expect(applyDashboardPinOperation(pins, { kind: 'move', item: page('/c'), before: page('/a') })).toEqual([
      page('/c'),
      page('/a'),
      page('/b'),
    ]);
    expect(applyDashboardPinOperation(pins, { kind: 'move', item: page('/a') })).toEqual([
      page('/b'),
      page('/c'),
      page('/a'),
    ]);
    expect(applyDashboardPinOperation(pins, { kind: 'move', item: page('/x'), before: page('/a') })).toEqual(pins);
  });
});

describe('DashboardPinsService', () => {
  let directory: string;
  let source: DataSource;
  let service: DashboardPinsService;
  let userId: number;
  let otherUserId: number;

  const createResource = (name: string) =>
    source.getRepository(Resource).save({ name, type: ResourceType.Machine } as Resource);
  const ids = async (forUser = userId) => (await service.getPins(forUser)).map(({ itemId }) => itemId);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dashboard-pins-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    const users = source.getRepository(User);
    userId = (await users.save({ username: 'pinner', email: 'pinner@example.com' } as User)).id;
    otherUserId = (await users.save({ username: 'other', email: 'other@example.com' } as User)).id;
    service = new DashboardPinsService(source.getRepository(DashboardPin), source.getRepository(Resource));
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(false);
    jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([]);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
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

  it('keeps every write when several arrive at once', async () => {
    const paths = ['/projects', '/messages', '/settings', '/users', '/billing'];
    await Promise.all(paths.map((path) => service.updatePins(userId, { kind: 'add', item: page(path) })));
    expect((await ids()).sort()).toEqual([...paths].sort());
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
