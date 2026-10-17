import { ResourceIntroducer, User } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceIntroducersService } from './resourceIntroducers.service';

export function registerResourceIntroducersServiceFixture() {
  let service: ResourceIntroducersService;

  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let userRepository: { findOne: jest.Mock };

  let eventEmitter: { emit: jest.Mock };

  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };

  const emptyGroupQuery = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
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
    userRepository = { findOne: jest.fn().mockResolvedValue({ id: 2, locale: 'en' } as User) };
    eventEmitter = { emit: jest.fn() };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroducersService,
        { provide: getRepositoryToken(ResourceIntroducer), useValue: repository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceIntroducersService);
  });
  return {
    get service() {
      return service;
    },
    get repository() {
      return repository;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get notifications() {
      return notifications;
    },
  };
}
