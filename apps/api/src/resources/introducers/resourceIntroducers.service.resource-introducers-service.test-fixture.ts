import { ResourceIntroducerPersistence } from './persistence/port';
import { ResourceIntroducer, User } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceIntroducersService } from './resourceIntroducers.service';

export function registerResourceIntroducersServiceFixture() {
  let service: ResourceIntroducersService;

  let persistence: jest.Mocked<ResourceIntroducerPersistence>;

  let eventEmitter: { emit: jest.Mock };

  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };

  beforeEach(async () => {
    persistence = {
      directGrants: jest.fn().mockResolvedValue([]),
      groupGrants: jest.fn().mockResolvedValue([]),
      inheritedGrants: jest.fn().mockResolvedValue([]),
      directGrant: jest.fn(),
      hasGroupGrant: jest.fn().mockResolvedValue(false),
      recipient: jest.fn().mockResolvedValue({ id: 2, locale: 'en' } as User),
      createGrant: jest.fn(async (resourceId, userId, type) => ({ resourceId, userId, type }) as ResourceIntroducer),
      removeGrant: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroducersService,
        { provide: ResourceIntroducerPersistence, useValue: persistence },
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
    get persistence() {
      return persistence;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get notifications() {
      return notifications;
    },
  };
}
