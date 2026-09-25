import { BadRequestException } from '@nestjs/common';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { In, Repository } from 'typeorm';
import { DashboardPinsService } from './dashboard-pins.service';

describe('DashboardPinsService', () => {
  let service: DashboardPinsService;
  let pinRepository: jest.Mocked<Partial<Repository<DashboardPin>>>;
  let resourceRepository: jest.Mocked<Partial<Repository<Resource>>>;
  const deletePins = jest.fn();
  const insertPins = jest.fn();

  beforeEach(async () => {
    pinRepository = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      manager: { transaction: jest.fn(async (callback: (manager: { getRepository: () => { delete: typeof deletePins; insert: typeof insertPins } }) => Promise<void>) => callback({ getRepository: () => ({ delete: deletePins, insert: insertPins }) })) } as never,
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
  });

  it('starts with no pins and replaces a user list in its requested order', async () => {
    expect(await service.get(5)).toEqual([]);
    const ordered = [{ itemType: 'page' as const, itemId: '/messages' }, { itemType: 'resource' as const, itemId: '7' }];
    (resourceRepository.find as jest.Mock).mockResolvedValue([{ id: 7 }]);
    expect(await service.replace(5, ordered)).toEqual(ordered);
    expect(deletePins).toHaveBeenCalledWith({ userId: 5 });
    expect(insertPins).toHaveBeenCalledWith([
      { userId: 5, itemType: 'page', itemId: '/messages', position: 0 },
      { userId: 5, itemType: 'resource', itemId: '7', position: 1 },
    ]);
  });

  it('rejects duplicate pins and nonexistent resources before replacing saved pins', async () => {
    await expect(service.replace(5, [
      { itemType: 'page', itemId: '/projects' }, { itemType: 'page', itemId: '/projects' },
    ])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replace(5, [{ itemType: 'resource', itemId: '42' }])).rejects.toBeInstanceOf(BadRequestException);
    expect(deletePins).not.toHaveBeenCalled();
  });

  it('rejects non-sidebar paths and dashboard or kiosk routes', async () => {
    for (const itemId of ['/dashboard', '/kiosk/123', '/not-a-sidebar-route']) {
      await expect(service.replace(5, [{ itemType: 'page', itemId }])).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('cleans pins for soft-deleted resources when reading the persisted list', async () => {
    (pinRepository.find as jest.Mock).mockResolvedValue([
      { id: 1, userId: 5, itemType: 'page', itemId: '/projects', position: 0 },
      { id: 2, userId: 5, itemType: 'resource', itemId: '42', position: 1 },
    ]);
    (resourceRepository.find as jest.Mock).mockResolvedValue([]);
    expect(await service.get(5)).toEqual([{ itemType: 'page', itemId: '/projects' }]);
    expect(pinRepository.delete).toHaveBeenCalledWith({ userId: 5, itemType: 'resource', itemId: '42' });
    expect(deletePins).not.toHaveBeenCalled();
  });
});
