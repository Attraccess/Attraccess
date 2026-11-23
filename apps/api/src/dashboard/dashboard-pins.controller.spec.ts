import { BadRequestException } from '@nestjs/common';
import type { StoredDashboardPin } from '@attraccess/application-models';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { TransactionScope, UnitOfWork } from '../database/unit-of-work';
import { PluginService } from '../plugin-system/plugin.service';
import * as pluginsDisabled from '../plugin-system/plugins-disabled';
import type { SettingsService } from '../settings/settings.service';
import type { ResourceStore } from '../resources/resource-store.port';
import { ResourceListVisibilityService } from '../resources/visibility/resource-list-visibility.service';
import type { DashboardPinStore } from './dashboard-pin-store.port';
import { DashboardPinsController } from './dashboard-pins.controller';
import { DashboardPinsService } from './dashboard-pins.service';
import type { DashboardPinDto } from './dtos/dashboard-pin.dto';

const page = (itemId: string): StoredDashboardPin => ({ itemType: 'page', itemId, size: null });
const resource = (itemId: string): StoredDashboardPin => ({ itemType: 'resource', itemId, size: null });
const widget = (itemId: string): StoredDashboardPin => ({ itemType: 'widget', itemId, size: null });

const VISIBLE = 1;
const HIDDEN = 2;
const MISSING = 999;
const RESOURCES: Record<number, string> = { [VISIBLE]: 'Mill', [HIDDEN]: 'Secret lathe' };

const keys = (pins: DashboardPinDto[]) => pins.map((pin) => `${pin.itemType}:${pin.itemId}`);

/** The real pin service over an in-memory store, behind the real visibility rule in "permitted-only" mode. */
function setup(initial: StoredDashboardPin[]) {
  let pins = initial;
  const pinStore: jest.Mocked<DashboardPinStore> = {
    listPins: jest.fn(async () => pins),
    listPinsForUpdate: jest.fn(async () => pins),
    replacePins: jest.fn(async (_userId, next) => {
      pins = next;
    }),
    deleteResourcePins: jest.fn(async (_userId, ids) => {
      pins = pins.filter((pin) => !(pin.itemType === 'resource' && ids.includes(pin.itemId)));
    }),
    resourceNames: jest.fn(
      async (ids) => new Map(ids.filter((id) => id in RESOURCES).map((id) => [id, RESOURCES[id]])),
    ),
    resourceExists: jest.fn(async (id) => id in RESOURCES),
  };
  const scope = { isOpen: true, afterCommit: jest.fn() } as TransactionScope;
  const uow = {
    run: jest.fn(async (work: (scope: TransactionScope) => Promise<unknown>) => work(scope)),
    current: () => undefined,
  } as unknown as UnitOfWork;
  const service = new DashboardPinsService(pinStore, uow);
  const resourceStore = {
    permittedIds: jest.fn(async (_userId: number, ids: number[]) => ids.filter((id) => id === VISIBLE)),
  } as unknown as ResourceStore;
  const settings = { getResourceListVisibility: jest.fn(async () => 'permitted-only') } as unknown as SettingsService;
  const controller = new DashboardPinsController(service, new ResourceListVisibilityService(settings, resourceStore));
  return { controller, service, pinStore, pins: () => pins };
}

const reader = {
  user: { id: 7, effectivePermissions: new Set(['resources.read']) },
} as unknown as AuthenticatedRequest;
const manager = {
  user: { id: 7, effectivePermissions: new Set(['resources.read', 'resources.update']) },
} as unknown as AuthenticatedRequest;

describe('DashboardPinsController (ATT-843 machine list visibility)', () => {
  beforeEach(() => {
    jest.spyOn(pluginsDisabled, 'arePluginsDisabled').mockReturnValue(false);
    jest.spyOn(PluginService, 'getPluginsWithLoadStatus').mockReturnValue([]);
    jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it('GET drops the pins of hidden machines, keeps the others and leaves the hidden pin stored', async () => {
    const { controller, pins } = setup([
      page('/projects'),
      resource(String(VISIBLE)),
      resource(String(HIDDEN)),
      widget('messages'),
    ]);

    const result = await controller.getPins(reader);

    expect(keys(result)).toEqual(['page:/projects', `resource:${VISIBLE}`, 'widget:messages']);
    expect(JSON.stringify(result)).not.toContain('Secret lathe');
    expect(keys(pins())).toContain(`resource:${HIDDEN}`);
  });

  it('GET returns every pin to a resource manager', async () => {
    const { controller } = setup([resource(String(VISIBLE)), resource(String(HIDDEN))]);
    expect(keys(await controller.getPins(manager))).toEqual([`resource:${VISIBLE}`, `resource:${HIDDEN}`]);
  });

  it('PATCH add of a hidden machine answers 400 like a machine that does not exist, without writing', async () => {
    const { controller, service, pinStore } = setup([page('/projects')]);
    const update = jest.spyOn(service, 'updatePins');

    const missing = await controller
      .updatePins(reader, { kind: 'add', item: resource(String(MISSING)) })
      .catch((error: unknown) => error);
    update.mockClear();
    const hidden = await controller
      .updatePins(reader, { kind: 'add', item: resource(String(HIDDEN)) })
      .catch((error: unknown) => error);

    expect(missing).toBeInstanceOf(BadRequestException);
    expect(hidden).toBeInstanceOf(BadRequestException);
    expect((hidden as BadRequestException).getResponse()).toEqual(
      JSON.parse(
        JSON.stringify((missing as BadRequestException).getResponse())
          .split(String(MISSING))
          .join(String(HIDDEN)),
      ),
    );
    expect((hidden as BadRequestException).message).toBe(`Resource ${HIDDEN} does not exist`);
    expect(update).not.toHaveBeenCalled();
    expect(pinStore.replacePins).not.toHaveBeenCalled();
  });

  it('PATCH add of a visible machine pins it', async () => {
    const { controller, pins } = setup([]);
    const result = await controller.updatePins(reader, { kind: 'add', item: resource(String(VISIBLE)) });
    expect(keys(result)).toEqual([`resource:${VISIBLE}`]);
    expect(keys(pins())).toEqual([`resource:${VISIBLE}`]);
  });

  it('PATCH remove of a hidden pin removes it', async () => {
    const { controller, pins } = setup([page('/projects'), resource(String(HIDDEN))]);

    const result = await controller.updatePins(reader, { kind: 'remove', item: resource(String(HIDDEN)) });

    expect(keys(result)).toEqual(['page:/projects']);
    expect(keys(pins())).toEqual(['page:/projects']);
  });

  it('PATCH answers with the list without hidden machines, while the stored list keeps them', async () => {
    const { controller, pins } = setup([resource(String(HIDDEN)), resource(String(VISIBLE))]);

    const result = await controller.updatePins(reader, { kind: 'add', item: page('/projects') });

    expect(keys(result)).toEqual([`resource:${VISIBLE}`, 'page:/projects']);
    expect(keys(pins())).toEqual([`resource:${HIDDEN}`, `resource:${VISIBLE}`, 'page:/projects']);
  });
});
