import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Message } from '@attraccess/database-entities';
import { LiveTopic } from '@attraccess/shared';
import { Test } from '@nestjs/testing';
import { Subject } from 'rxjs';
import { BillingLiveTopicsProvider } from '../billing/billing-live-topics.provider';
import { LiveNotificationsService } from '../billing/liveNotificationsService';
import { MessagingLiveTopicsProvider } from '../messaging/messaging-live-topics.provider';
import { MessagingLiveService } from '../messaging/messaging-live.service';
import { NotificationLiveTopicsProvider } from '../notifications/notification-live-topics.provider';
import { NotificationLiveService } from '../notifications/notification-live.service';
import { SupervisionLiveTopicsProvider } from '../resources/supervision/supervision-live-topics.provider';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';
import { LiveTopicsModule } from './live-topics.module';
import { LiveTopicsService } from './live-topics.service';

it.each(['billing', 'messaging', 'notifications', 'supervision'] as const)(
  'registers the %s adapter through Nest lifecycle and retains user routing and cleanup',
  async (topic) => {
    const subjects = new Map<number, Subject<{ data: object }>>();
    const getSubject = jest.fn((id: number) => {
      if (!subjects.has(id)) subjects.set(id, new Subject());
      return subjects.get(id);
    });
    const release = jest.fn();
    const services = {
      billing: { getTransactionSubject: getSubject, deleteSubjectIfUnobserved: release },
      messaging: new MessagingLiveService(undefined, undefined),
      notifications: { getUserSubject: getSubject, deleteSubjectIfUnobserved: release },
      supervision: { getSupervisorSubject: getSubject, deleteSubjectIfUnobserved: release },
    };
    const module = await Test.createTestingModule({
      imports: [LiveTopicsModule],
      providers: [
        BillingLiveTopicsProvider,
        MessagingLiveTopicsProvider,
        NotificationLiveTopicsProvider,
        SupervisionLiveTopicsProvider,
        { provide: LiveNotificationsService, useValue: services.billing },
        { provide: MessagingLiveService, useValue: services.messaging },
        { provide: NotificationLiveService, useValue: services.notifications },
        { provide: SupervisionLiveService, useValue: services.supervision },
      ],
    }).compile();
    await module.init();
    try {
      const registry = module.get(LiveTopicsService);
      // All adapters register themselves; the transport module never imports these producers.
      for (const name of Object.keys(services) as LiveTopic[])
        expect(registry.parse({ topic: name })).toEqual({ topic: name });
      const subscription = registry.parse({ topic });
      const first: unknown[] = [],
        second: unknown[] = [];
      const a = (await registry.source(subscription, { id: 1 } as AuthenticatedUser)).subscribe((value) =>
        first.push(value),
      );
      const b = (await registry.source(subscription, { id: 2 } as AuthenticatedUser)).subscribe((value) =>
        second.push(value),
      );
      const firstSubject = topic === 'messaging' ? services.messaging.getUserMessageSubject(1) : subjects.get(1);
      firstSubject.next({ data: Object.assign(new Message(), { id: 5 }) });
      expect(first).toEqual([{ data: { id: 5 } }]);
      expect(second).toEqual([]);
      if (topic === 'messaging') expect(services.messaging.isOnline(1)).toBe(true);
      a.unsubscribe();
      b.unsubscribe();
      expect(firstSubject.observed).toBe(false);
      if (topic === 'messaging') {
        expect(services.messaging.isOnline(1)).toBe(false);
        expect(services.messaging.isOnline(2)).toBe(false);
        expect(services.messaging.getUserMessageSubject(1)).not.toBe(firstSubject);
      } else expect(release.mock.calls).toEqual([[1], [2]]);
    } finally {
      await module.close();
    }
  },
);
