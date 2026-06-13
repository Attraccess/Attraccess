import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/database-entities';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('ResourceIntroducersService', () => {
  let service: ResourceIntroducersService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let notifications: { dispatch: jest.Mock };

  const emptyGroupQuery = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(emptyGroupQuery),
    };
    eventEmitter = { emit: jest.fn() };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroducersService,
        { provide: getRepositoryToken(ResourceIntroducer), useValue: repository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceIntroducersService);
  });

  describe('getMany', () => {
    it('returns both direct and group-inherited introducers, deduped by user', async () => {
      const directIntroducer = {
        id: 1,
        userId: 10,
        resourceId: 1,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;
      const groupIntroducer = {
        id: 2,
        userId: 20,
        resourceGroupId: 5,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 20 },
      } as unknown as ResourceIntroducer;

      repository.find.mockResolvedValue([directIntroducer]);

      const groupQuery = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([groupIntroducer]),
      };
      repository.createQueryBuilder.mockReturnValue(groupQuery);

      const result = await service.getMany(1);

      expect(result).toEqual([directIntroducer, groupIntroducer]);
    });

    it('does not list a user twice when they are both a direct and a group introducer', async () => {
      const directIntroducer = {
        id: 1,
        userId: 10,
        resourceId: 1,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;
      const groupIntroducer = {
        id: 2,
        userId: 10,
        resourceGroupId: 5,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;

      repository.find.mockResolvedValue([directIntroducer]);

      const groupQuery = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([groupIntroducer]),
      };
      repository.createQueryBuilder.mockReturnValue(groupQuery);

      const result = await service.getMany(1);

      expect(result).toEqual([directIntroducer]);
    });
  });

  describe('isIntroducer', () => {
    it('returns true for a direct introducer row', async () => {
      repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer);
      await expect(service.isIntroducer(1, 2, false)).resolves.toBe(true);
    });

    it('returns false for a maintainer row (maintainers cannot give introductions)', async () => {
      repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.MAINTAINER } as ResourceIntroducer);
      await expect(service.isIntroducer(1, 2, false)).resolves.toBe(false);
    });

    it('returns false when there is no row', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.isIntroducer(1, 2, false)).resolves.toBe(false);
    });
  });

  describe('canMaintain', () => {
    it('returns true for a maintainer row', async () => {
      repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.MAINTAINER } as ResourceIntroducer);
      await expect(service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns true for an introducer row', async () => {
      repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer);
      await expect(service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns false when there is no row', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.canMaintain(1, 2, false)).resolves.toBe(false);
    });
  });

  describe('grant', () => {
    it('creates a maintainer row when none exists', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data) => data);
      repository.save.mockImplementation(async (data) => data);

      const result = await service.grant(1, 2, ResourceIntroducerType.MAINTAINER);

      expect(repository.create).toHaveBeenCalledWith({
        resourceId: 1,
        userId: 2,
        type: ResourceIntroducerType.MAINTAINER,
      });
      expect(result.type).toBe(ResourceIntroducerType.MAINTAINER);
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: 2 })],
          title: 'Your resource access changed',
          body: 'You were made a maintainer for resource #1.',
          url: '/resources/1',
        }),
      );
    });

    it('defaults to introducer when no type is provided', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data) => data);
      repository.save.mockImplementation(async (data) => data);

      await service.grant(1, 2);

      expect(repository.create).toHaveBeenCalledWith({
        resourceId: 1,
        userId: 2,
        type: ResourceIntroducerType.INTRODUCER,
      });
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'You were made an introducer for resource #1.',
        }),
      );
    });

    it('upgrades an existing row to the requested type', async () => {
      const existing = { type: ResourceIntroducerType.MAINTAINER } as ResourceIntroducer;
      repository.findOne.mockResolvedValue(existing);
      repository.save.mockImplementation(async (data) => data);

      const result = await service.grant(1, 2, ResourceIntroducerType.INTRODUCER);

      expect(result.type).toBe(ResourceIntroducerType.INTRODUCER);
      expect(repository.save).toHaveBeenCalledWith(existing);
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'You were made an introducer for resource #1.',
        }),
      );
    });

    it('does not re-save when the existing row already matches', async () => {
      const existing = { type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer;
      repository.findOne.mockResolvedValue(existing);

      await service.grant(1, 2, ResourceIntroducerType.INTRODUCER);

      expect(repository.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('notifies the user when resource introducer or maintainer access is revoked', async () => {
      repository.findOne.mockResolvedValue({ userId: 2, type: ResourceIntroducerType.MAINTAINER } as ResourceIntroducer);
      repository.remove.mockImplementation(async (data) => data);

      await service.revoke(1, 2);

      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: 2 })],
          body: 'Your maintainer status for resource #1 was revoked.',
          url: '/resources/1',
        }),
      );
    });
  });
});
