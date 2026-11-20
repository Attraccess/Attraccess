import { BadRequestException } from '@nestjs/common';
import type { TransactionScope, UnitOfWork } from '../database/unit-of-work';
import { PluginService } from '../plugin-system/plugin.service';
import * as pluginsDisabled from '../plugin-system/plugins-disabled';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DashboardPinStore } from './dashboard-pin-store.port';
import {
  DashboardPinsService,
  MAX_DASHBOARD_PINS,
  StoredDashboardPin,
  applyDashboardPinOperation,
} from './dashboard-pins.service';
import { UpdateDashboardPinsDto } from './dtos/dashboard-pin.dto';

// Stored pins without a chosen size; as operation items the size is ignored.
const page = (itemId: string): StoredDashboardPin => ({ itemType: 'page', itemId, size: null });
const resource = (itemId: string): StoredDashboardPin => ({ itemType: 'resource', itemId, size: null });
const widget = (itemId: string): StoredDashboardPin => ({ itemType: 'widget', itemId, size: null });

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

  it('adds an item with a size and resizes a pinned one, ignoring an unknown one', () => {
    expect(applyDashboardPinOperation(pins, { kind: 'add', item: page('/d'), size: 'small' })).toEqual([
      ...pins,
      { ...page('/d'), size: 'small' },
    ]);
    expect(applyDashboardPinOperation(pins, { kind: 'resize', item: page('/b'), size: 'large' })).toEqual([
      page('/a'),
      { ...page('/b'), size: 'large' },
      page('/c'),
    ]);
    expect(applyDashboardPinOperation(pins, { kind: 'resize', item: page('/x'), size: 'large' })).toEqual(pins);
  });
});

describe('UpdateDashboardPinsDto', () => {
  const errorsOf = async (body: object) =>
    (await validate(plainToInstance(UpdateDashboardPinsDto, body))).map((error) => error.property);
  const item = { itemType: 'widget', itemId: 'messages' };

  it('accepts the three sizes, and add without a size', async () => {
    for (const size of ['small', 'medium', 'large']) {
      expect(await errorsOf({ kind: 'resize', item, size })).toEqual([]);
    }
    expect(await errorsOf({ kind: 'add', item })).toEqual([]);
  });

  it('rejects an invalid size, and resize without one', async () => {
    expect(await errorsOf({ kind: 'add', item, size: 'huge' })).toEqual(['size']);
    expect(await errorsOf({ kind: 'resize', item, size: 'huge' })).toEqual(['size']);
    expect(await errorsOf({ kind: 'resize', item })).toEqual(['size']);
  });
});

/** A store that keeps pins in memory and records how the service used the unit of work. */
function setup(initial: StoredDashboardPin[] = [], resources: Record<number, string> = {}) {
  let pins = initial;
  const scope = { isOpen: true, afterCommit: jest.fn() } as TransactionScope;
  const store: jest.Mocked<DashboardPinStore> = {
    listPins: jest.fn(async () => pins),
    listPinsForUpdate: jest.fn(async () => pins),
    replacePins: jest.fn(async (_userId, next) => {
      pins = next;
    }),
    deleteResourcePins: jest.fn(async (_userId, ids) => {
      pins = pins.filter((pin) => !(pin.itemType === 'resource' && ids.includes(pin.itemId)));
    }),
    resourceNames: jest.fn(
      async (ids) => new Map(ids.filter((id) => id in resources).map((id) => [id, resources[id]])),
    ),
    resourceExists: jest.fn(async (id) => id in resources),
  };
  const run = jest.fn(async (work: (scope: TransactionScope) => Promise<unknown>) => work(scope));
  const uow = { run, current: () => undefined } as unknown as UnitOfWork;
  return { service: new DashboardPinsService(store, uow), store, run, scope, pins: () => pins };
}

describe('DashboardPinsService', () => {
  beforeEach(() => {
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(false);
    jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([]);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads, rewrites and returns the list inside one unit of work, after locking the user', async () => {
    const { service, store, run, scope } = setup([page('/projects')]);

    expect(await service.updatePins(7, { kind: 'add', item: page('/messages') })).toEqual([
      page('/projects'),
      page('/messages'),
    ]);

    expect(store.listPinsForUpdate).toHaveBeenCalledWith(7, scope);
    expect(store.replacePins).toHaveBeenCalledWith(7, [page('/projects'), page('/messages')], scope);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the operation changes nothing', async () => {
    const { service, store } = setup([page('/projects')]);
    await service.updatePins(7, { kind: 'add', item: page('/projects') });
    await service.updatePins(7, { kind: 'remove', item: page('/messages') });
    expect(store.replacePins).not.toHaveBeenCalled();
  });

  it('rejects an addition beyond the limit without writing', async () => {
    const full = Array.from({ length: MAX_DASHBOARD_PINS }, (_, position) => page(`/stored-${position}`));
    const { service, store } = setup(full);
    await expect(service.updatePins(7, { kind: 'add', item: page('/projects') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(store.replacePins).not.toHaveBeenCalled();
  });

  it.each(['/dashboard', '/kiosk/companion', '/resources/1', '/does-not-exist'])(
    'rejects adding the page %s before touching the unit of work',
    async (path) => {
      const { service, run } = setup();
      await expect(service.updatePins(7, { kind: 'add', item: page(path) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown widget and a missing resource, accepts an existing one with its name', async () => {
    const { service } = setup([], { 5: 'Lathe' });
    await expect(service.updatePins(7, { kind: 'add', item: widget('weather') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updatePins(7, { kind: 'add', item: resource('99999') })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await service.updatePins(7, { kind: 'add', item: resource('5') })).toEqual([
      { ...resource('5'), resourceName: 'Lathe' },
    ]);
  });

  it('drops pins of resources that no longer exist when reading, and deletes them in a unit of work', async () => {
    const { service, store, run, scope, pins } = setup([page('/projects'), resource('5'), resource('6')], {
      5: 'Lathe',
    });

    expect(await service.getPins(7)).toEqual([page('/projects'), { ...resource('5'), resourceName: 'Lathe' }]);

    expect(store.deleteResourcePins).toHaveBeenCalledWith(7, ['6'], scope);
    expect(run).toHaveBeenCalledTimes(1);
    expect(pins().map((pin) => pin.itemId)).toEqual(['/projects', '5']);
  });

  it('opens no unit of work when nothing is stale', async () => {
    const { service, run } = setup([page('/projects')]);
    await service.getPins(7);
    expect(run).not.toHaveBeenCalled();
  });
});
