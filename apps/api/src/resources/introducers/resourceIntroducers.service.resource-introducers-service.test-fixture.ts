import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { RESOURCE_INTRODUCER_STORE, type ResourceIntroducerStore } from './resource-introducer-store.port';

export type IntroducerStoreFake = { [K in keyof ResourceIntroducerStore]: jest.Mock };

/** A grant record; `user` defaults to a minimal user so that grants without one can be built on purpose. */
export const grantRecord = (overrides: Partial<ResourceIntroducerRecord> & { id: number }): ResourceIntroducerRecord =>
  ({
    type: ResourceIntroducerType.INTRODUCER,
    resourceId: 1,
    userId: 10,
    resourceGroupId: null,
    grantedAt: new Date('2030-01-01T00:00:00Z'),
    ...overrides,
  }) as ResourceIntroducerRecord;

export function registerResourceIntroducersServiceFixture() {
  let service: ResourceIntroducersService;
  let store: IntroducerStoreFake;
  let eventEmitter: { emit: jest.Mock };
  let notifications: { dispatchToUser: jest.Mock; sendEmailTemplate: jest.Mock };

  beforeEach(async () => {
    store = {
      findDirect: jest.fn().mockResolvedValue(null),
      hasGroupGrant: jest.fn().mockResolvedValue(false),
      listDirect: jest.fn().mockResolvedValue([]),
      listViaGroups: jest.fn().mockResolvedValue([]),
      listDirectForResources: jest.fn().mockResolvedValue([]),
      listViaGroupsForResources: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      findResourceName: jest.fn().mockResolvedValue('Laser Cutter'),
    };
    eventEmitter = { emit: jest.fn() };
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroducersService,
        { provide: RESOURCE_INTRODUCER_STORE, useValue: store },
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
    get store() {
      return store;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get notifications() {
      return notifications;
    },
  };
}
