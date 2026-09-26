import { BadRequestException } from '@nestjs/common';
import { DashboardPin, Resource, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { In, Repository } from 'typeorm';
import { DashboardPinsService } from './dashboard-pins.service';
import { PluginService } from '../plugin-system/plugin.service';

describe('DashboardPinsService', () => {
  let service: DashboardPinsService;
  let pinRepository: jest.Mocked<Partial<Repository<DashboardPin>>>;
  let resourceRepository: jest.Mocked<Partial<Repository<Resource>>>;
  let stored: DashboardPin[];
  const userLock = jest.fn();
  const sqliteLock = jest.fn();
  let driver = 'postgres';
  let transaction: Promise<void>;

  beforeEach(async () => {
    stored = [];
    driver = 'postgres';
    userLock.mockReset().mockResolvedValue({ id: 5 });
    sqliteLock.mockReset().mockResolvedValue([]);
    pinRepository = {
      find: jest.fn(async () => stored.map((pin) => ({ ...pin }))),
      delete: jest.fn(async () => { stored = []; return { affected: 1, raw: [] }; }),
      manager: {
        transaction: jest.fn(async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<void>) => {
          transaction = (transaction ?? Promise.resolve()).then(() => callback({
            connection: { options: { type: driver } },
            query: sqliteLock,
            getRepository: (entity) => entity === User ? { findOneOrFail: userLock } : pinRepository,
          }));
          await transaction;
        }),
      } as never,
      insert: jest.fn(async (items: DashboardPin[]) => {
        stored = items.map((pin, index) => ({ ...pin, id: index + 1 }));
        return { identifiers: [], generatedMaps: [], raw: [] };
      }),
    };
    resourceRepository = { find: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        DashboardPinsService,
        { provide: getRepositoryToken(DashboardPin), useValue: pinRepository },
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
      ],
    }).compile();
    service = module.get(DashboardPinsService);
    jest.clearAllMocks();
    transaction = Promise.resolve();
  });

  const page = (itemId: string) => ({ itemType: 'page' as const, itemId });

  it('merges writes from separate sessions against the stored list', async () => {
    await service.update(5, { kind: 'add', item: page('/projects') });
    const first = service.update(5, { kind: 'add', item: page('/messages') });
    const second = service.update(5, { kind: 'add', item: page('/shelly') });
    await Promise.all([first, second]);
    expect(await service.get(5)).toEqual([page('/projects'), page('/messages'), page('/shelly')]);
    expect(userLock).toHaveBeenCalledWith({ where: { id: 5 }, lock: { mode: 'pessimistic_write' } });
    await service.update(5, { kind: 'remove', item: page('/projects') });
    expect(await service.get(5)).toEqual([page('/messages'), page('/shelly')]);
    await service.update(5, { kind: 'remove', item: page('/messages') });
    await service.update(5, { kind: 'remove', item: page('/shelly') });
    expect(await service.get(5)).toEqual([]);
  });

  it('moves a pin while retaining pins added in another session', async () => {
    for (const itemId of ['/projects', '/messages', '/shelly']) await service.update(5, { kind: 'add', item: page(itemId) });
    await service.update(5, { kind: 'move', item: page('/shelly'), before: page('/messages') });
    expect(await service.get(5)).toEqual([page('/projects'), page('/shelly'), page('/messages')]);
  });

  it('acquires a SQLite writer lock before reading the current pins', async () => {
    driver = 'sqlite';
    await service.update(5, { kind: 'add', item: page('/projects') });
    expect(sqliteLock).toHaveBeenCalledWith('UPDATE "user" SET "id" = "id" WHERE "id" = ?', [5]);
    expect(userLock).not.toHaveBeenCalled();
  });

  it('validates additions and limits the resulting list', async () => {
    for (const itemId of ['/dashboard', '/kiosk', '/kiosk/display', '/resources/123', '/resources/123/edit', '/does-not-exist', '/kiosk/companion', '//plugin-report', 'https://example.com', '/plugin/../admin', '/bad path']) {
      await expect(service.update(5, { kind: 'add', item: page(itemId) })).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const itemId of ['/resources', '/shelly', '/wago', '/rabbitmq', '/dependencies']) {
      await service.update(5, { kind: 'add', item: page(itemId) });
    }
    expect((await service.get(5)).map(({ itemId }) => itemId)).toEqual(['/resources', '/shelly', '/wago', '/rabbitmq', '/dependencies']);
    for (const itemId of ['/resources', '/shelly', '/wago', '/rabbitmq', '/dependencies']) {
      await service.update(5, { kind: 'remove', item: page(itemId) });
    }
    for (const itemId of ['007', '7.0', '7e0', ' 7']) {
      await expect(service.update(5, { kind: 'add', item: { itemType: 'resource', itemId } })).rejects.toBeInstanceOf(BadRequestException);
    }
    stored = Array.from({ length: 200 }, (_, index) => ({ id: index + 1, userId: 5, position: index, ...page('/shelly') }));
    await expect(service.update(5, { kind: 'add', item: page('/projects') })).rejects.toBeInstanceOf(BadRequestException);
    expect(stored).toHaveLength(200);
  });

  it('accepts only sidebar page paths declared by installed frontend plugins', async () => {
    const plugins = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([{
      status: 'loaded', main: { frontend: { dashboardPaths: ['/plugin-report'] } },
    } as never]);
    await service.update(5, { kind: 'add', item: page('/plugin-report') });
    expect(await service.get(5)).toEqual([page('/plugin-report')]);
    await expect(service.update(5, { kind: 'add', item: page('/unregistered-plugin-route') })).rejects.toBeInstanceOf(BadRequestException);
    plugins.mockRestore();
  });

  it('cleans pins for soft-deleted resources without replacing other pins', async () => {
    stored = [
      { id: 1, userId: 5, position: 0, ...page('/projects') },
      { id: 2, userId: 5, position: 1, itemType: 'resource', itemId: '42' },
    ];
    (pinRepository.delete as jest.Mock).mockImplementationOnce(async () => ({ affected: 1, raw: [] }));
    expect(await service.get(5)).toEqual([page('/projects')]);
    expect(pinRepository.delete).toHaveBeenCalledWith({ userId: 5, id: In([2]) });
  });
});
