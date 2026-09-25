import { BadRequestException } from '@nestjs/common';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { DashboardPinsService } from './dashboard-pins.service';

describe('DashboardPinsService', () => {
  let service: DashboardPinsService;
  let pinRepository: jest.Mocked<Partial<Repository<DashboardPin>>>;
  let resourceRepository: jest.Mocked<Partial<Repository<Resource>>>;
  const deletePins = jest.fn();
  const insertPins = jest.fn();
  const findPins = jest.fn();

  beforeEach(async () => {
    pinRepository = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      manager: {
        transaction: jest.fn(
          async (
            callback: (manager: {
              getRepository: () => { delete: typeof deletePins; insert: typeof insertPins; find: typeof findPins };
            }) => Promise<void>,
          ) => callback({ getRepository: () => ({ delete: deletePins, insert: insertPins, find: findPins }) }),
        ),
      } as never,
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
    findPins.mockResolvedValue([]);
  });

  it('starts with no pins and replaces a user list in its requested order', async () => {
    expect(await service.get(5)).toEqual([]);
    const ordered = [
      { itemType: 'page' as const, itemId: '/messages' },
      { itemType: 'resource' as const, itemId: '7' },
    ];
    (resourceRepository.find as jest.Mock).mockResolvedValue([{ id: 7 }]);
    expect(await service.replace(5, ordered)).toEqual(ordered);
    expect(deletePins).toHaveBeenCalledWith({ userId: 5 });
    expect(insertPins).toHaveBeenCalledWith([
      { userId: 5, itemType: 'page', itemId: '/messages', position: 0 },
      { userId: 5, itemType: 'resource', itemId: '7', position: 1 },
    ]);
  });

  it('rejects duplicate pins and nonexistent resources before replacing saved pins', async () => {
    await expect(
      service.replace(5, [
        { itemType: 'page', itemId: '/projects' },
        { itemType: 'page', itemId: '/projects' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replace(5, [{ itemType: 'resource', itemId: '42' }])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deletePins).not.toHaveBeenCalled();
  });

  it('accepts plugin-contributed internal routes and rejects dashboard, kiosk, and external paths', async () => {
    expect(await service.replace(5, [{ itemType: 'page', itemId: '/hello-world' }])).toEqual([
      { itemType: 'page', itemId: '/hello-world' },
    ]);
    for (const itemId of ['/dashboard', '/kiosk', '/kiosk/123', '//external.example']) {
      await expect(service.replace(5, [{ itemType: 'page', itemId }])).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('applies an add operation against the current stored pins', async () => {
    findPins.mockResolvedValue([{ userId: 5, itemType: 'page', itemId: '/projects', position: 0 }]);
    const added = { itemType: 'page' as const, itemId: '/hello-world' };
    expect(await service.replace(5, [added], { kind: 'add', item: added })).toEqual([
      { itemType: 'page', itemId: '/projects' },
      added,
    ]);
    expect(insertPins).toHaveBeenCalledWith([
      { userId: 5, itemType: 'page', itemId: '/projects', position: 0 },
      { userId: 5, itemType: 'page', itemId: '/hello-world', position: 1 },
    ]);
  });

  it('cleans pins for soft-deleted resources when reading the persisted list', async () => {
    (pinRepository.find as jest.Mock).mockResolvedValue([
      { id: 1, userId: 5, itemType: 'page', itemId: '/projects', position: 0 },
      { id: 2, userId: 5, itemType: 'resource', itemId: '42', position: 1 },
    ]);
    (resourceRepository.find as jest.Mock).mockResolvedValue([]);
    expect(await service.get(5)).toEqual([{ itemType: 'page', itemId: '/projects' }]);
    expect(pinRepository.delete).toHaveBeenCalledWith({ userId: 5, id: In([2]) });
    expect(deletePins).not.toHaveBeenCalled();
  });

  it('rejects noncanonical resource IDs', async () => {
    for (const itemId of ['007', '7.0', '7e0', ' 7', '+7', '9007199254740992']) {
      await expect(service.replace(5, [{ itemType: 'resource', itemId }])).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
