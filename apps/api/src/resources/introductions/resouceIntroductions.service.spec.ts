import { IntroductionPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/application-models';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { AuditService } from '../../audit/audit.service';

describe('ResourceIntroductionsService notifications', () => {
  let service: ResourceIntroductionsService;
  let persistence: jest.Mocked<IntroductionPersistence>;
  let notifications: { dispatch: jest.Mock };
  let retraining: { getIntroductionRetrainingStatus: jest.Mock };
  let audit: { recordResource: jest.Mock };

  beforeEach(async () => {
    persistence = {
      find: jest.fn().mockResolvedValue(null),
      latest: jest.fn(),
      list: jest.fn(),
      history: jest.fn(),
      setTutor: jest.fn(),
      create: jest.fn(async (_subject, userId) => ({ id: 10, receiverUser: { id: userId } }) as ResourceIntroduction),
      appendHistory: jest.fn(async (data) => ({ id: 20, ...data }) as unknown as ResourceIntroductionHistoryItem),
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    retraining = { getIntroductionRetrainingStatus: jest.fn().mockResolvedValue({ isDue: false }) };
    audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroductionsService,
        { provide: IntroductionPersistence, useValue: persistence },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: { resourceIntroductionsTotal: { inc: jest.fn() } } },
        { provide: NotificationDispatchService, useValue: notifications },
        { provide: ResourceRetrainingService, useValue: retraining },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ResourceIntroductionsService);
    audit.recordResource.mockClear();
  });

  it('notifies the user when a resource introduction is granted', async () => {
    await service.grant(7, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        title: 'Your resource access changed',
        body: 'You received an introduction for resource #7.',
        url: '/resources/7',
      }),
    );
  });

  it('records the acting user for a granted introduction', async () => {
    await service.grant(7, 3, undefined, { performedByUserId: 9 });

    expect(persistence.appendHistory).toHaveBeenCalledWith(expect.objectContaining({ performedByUserId: 9 }));
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'introduction.granted',
        actorId: 9,
        subjectId: 7,
        details: { recipientUserId: 3 },
      }),
    );
  });

  it('records a cleared event only when the renewed resource introduction was due', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    retraining.getIntroductionRetrainingStatus
      .mockResolvedValueOnce({ isDue: true })
      .mockResolvedValueOnce({ isDue: false });

    await service.grant(7, 3);

    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retraining.cleared',
        subjectId: 7,
        details: { introductionId: 10, usageUserId: 3 },
      }),
    );
  });

  it('does not clear a resource introduction when inactivity remains due after renewal', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    retraining.getIntroductionRetrainingStatus.mockResolvedValue({ isDue: true });

    await service.grant(7, 3);

    expect(audit.recordResource).not.toHaveBeenCalled();
  });

  it('records the acting user for a revoked introduction', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);

    await service.revoke(7, 3, undefined, { performedByUserId: 9 });

    expect(persistence.appendHistory).toHaveBeenCalledWith(expect.objectContaining({ performedByUserId: 9 }));
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'introduction.revoked', actorId: 9 }),
    );
  });

  it('does not notify when a resource introduction is granted twice without an effective access change', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.GRANT,
    } as ResourceIntroductionHistoryItem);

    await service.grant(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('notifies the user when a resource introduction is revoked', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.GRANT,
    } as ResourceIntroductionHistoryItem);
    await service.revoke(7, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introduction for resource #7 was revoked.',
        url: '/resources/7',
      }),
    );
  });

  it('does not notify when a resource introduction is revoked twice without an effective access change', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.REVOKE,
    } as ResourceIntroductionHistoryItem);

    await service.revoke(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not notify when revoking a resource introduction that was never granted', async () => {
    await service.revoke(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
