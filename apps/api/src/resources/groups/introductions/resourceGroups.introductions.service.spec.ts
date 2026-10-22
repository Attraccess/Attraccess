import { GroupIntroductionPersistence } from '../persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/application-models';
import { ResourceGroupsIntroductionsService } from './resourceGroups.introductions.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';
import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';
import { AuditService } from '../../../audit/audit.service';

describe('ResourceGroupsIntroductionsService notifications', () => {
  let service: ResourceGroupsIntroductionsService;
  let persistence: jest.Mocked<GroupIntroductionPersistence>;
  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };
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
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };
    retraining = { getIntroductionRetrainingStatus: jest.fn().mockResolvedValue({ isDue: false }) };
    audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroductionsService,
        { provide: GroupIntroductionPersistence, useValue: persistence },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationDispatchService, useValue: notifications },
        { provide: ResourceRetrainingService, useValue: retraining },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ResourceGroupsIntroductionsService);
    audit.recordResource.mockClear();
  });

  it('notifies the user when a group introduction is granted', async () => {
    await service.grant(5, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        title: 'Your group access changed',
        body: 'You received an introduction for group #5.',
        url: '/resource-groups/5',
      }),
    );
    const request = notifications.dispatch.mock.calls[0][0];
    await request.sendEmail({ id: 3, email: 'user@example.com' });
    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 }),
      NotificationCategory.ACCESS_CHANGES,
      {
        accessChange: {
          title: 'Your group access changed',
          body: 'You received an introduction for group #5.',
          url: '/resource-groups/5',
        },
      },
    );
  });

  it('records the acting user for a granted introduction', async () => {
    await service.grant(5, 3, undefined, { performedByUserId: 9 });

    expect(persistence.appendHistory).toHaveBeenCalledWith(expect.objectContaining({ performedByUserId: 9 }));
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'introduction.granted',
        actorId: 9,
        subjectType: 'resource_group',
        subjectId: 5,
        details: { recipientUserId: 3 },
      }),
    );
  });

  it('records a cleared event only when the renewed group introduction was due', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    retraining.getIntroductionRetrainingStatus
      .mockResolvedValueOnce({ isDue: true })
      .mockResolvedValueOnce({ isDue: false });

    await service.grant(5, 3);

    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retraining.cleared',
        subjectType: 'resource_group',
        subjectId: 5,
        details: { introductionId: 10, usageUserId: 3 },
      }),
    );
  });

  it('does not clear a group introduction when inactivity remains due after renewal', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    retraining.getIntroductionRetrainingStatus.mockResolvedValue({ isDue: true });

    await service.grant(5, 3);

    expect(audit.recordResource).not.toHaveBeenCalled();
  });

  it('records the acting user for a revoked introduction', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);

    await service.revoke(5, 3, undefined, { performedByUserId: 9 });

    expect(persistence.appendHistory).toHaveBeenCalledWith(expect.objectContaining({ performedByUserId: 9 }));
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'introduction.revoked', actorId: 9 }),
    );
  });

  it('does not notify when a group introduction is granted twice without an effective access change', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.GRANT,
    } as ResourceIntroductionHistoryItem);

    await service.grant(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('notifies the user when a group introduction is revoked', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.GRANT,
    } as ResourceIntroductionHistoryItem);

    await service.revoke(5, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introduction for group #5 was revoked.',
        url: '/resource-groups/5',
        sendEmail: expect.any(Function),
      }),
    );
  });

  it('does not notify when a group introduction is revoked twice without an effective access change', async () => {
    persistence.find.mockResolvedValue({ id: 10, receiverUser: { id: 3 } } as ResourceIntroduction);
    persistence.latest.mockResolvedValue({
      id: 19,
      action: IntroductionHistoryAction.REVOKE,
    } as ResourceIntroductionHistoryItem);

    await service.revoke(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not notify when revoking a group introduction that was never granted', async () => {
    await service.revoke(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
