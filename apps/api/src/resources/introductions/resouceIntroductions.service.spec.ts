import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntroductionHistoryAction, type IntroductionRecord } from '@attraccess/application-models';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { RESOURCE_INTRODUCTION_STORE, type ResourceIntroductionStore } from './resource-introduction-store.port';

const introduction = (overrides: Partial<IntroductionRecord> = {}): IntroductionRecord => ({
  id: 10,
  resourceId: 7,
  resourceGroupId: null,
  receiverUserId: 3,
  tutorUserId: null,
  completedAt: new Date('2030-01-01T00:00:00Z'),
  retrainingNotifiedAt: null,
  retrainingRequiredAuditedAt: null,
  createdAt: new Date('2030-01-01T00:00:00Z'),
  ...overrides,
});

describe('ResourceIntroductionsService notifications', () => {
  let service: ResourceIntroductionsService;
  let store: { [K in keyof ResourceIntroductionStore]: jest.Mock };
  let notifications: { dispatchToUser: jest.Mock };
  let retraining: { getIntroductionRetrainingStatus: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    store = {
      findOfUser: jest.fn().mockResolvedValue(null),
      findOfGroupUser: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      lastHistoryItem: jest.fn().mockResolvedValue(null),
      latestGrant: jest.fn(),
      listForResource: jest.fn().mockResolvedValue([]),
      historyOfUser: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async () => introduction()),
      setTutor: jest.fn().mockResolvedValue(undefined),
      addHistoryItem: jest.fn().mockImplementation(async (introductionId, action, comment, performedByUserId) => ({
        id: 20,
        introductionId,
        action,
        comment: comment ?? null,
        performedByUserId,
        createdAt: new Date(),
      })),
      listWithRetrainingRule: jest.fn(),
      markRetrainingRequiredAudited: jest.fn(),
      markRetrainingNotified: jest.fn(),
    };
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined) };
    retraining = { getIntroductionRetrainingStatus: jest.fn().mockResolvedValue({ isDue: false }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroductionsService,
        { provide: RESOURCE_INTRODUCTION_STORE, useValue: store },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: { resourceIntroductionsTotal: { inc: jest.fn() } } },
        { provide: NotificationDispatchService, useValue: notifications },
        { provide: ResourceRetrainingService, useValue: retraining },
        { provide: AUDIT_RECORDER, useValue: audit },
      ],
    }).compile();

    service = module.get(ResourceIntroductionsService);
    audit.record.mockClear();
  });

  it('notifies the user when a resource introduction is granted', async () => {
    await service.grant(7, 3);

    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        title: 'Your resource access changed',
        body: 'You received an introduction for resource #7.',
        url: '/resources/7',
      }),
    );
  });

  it('creates the introduction with its tutor on the first grant and changes a different tutor later', async () => {
    await service.grant(7, 3, undefined, { tutorUserId: 4 });
    expect(store.create).toHaveBeenCalledWith(7, 3, 4);

    store.findOfUser.mockResolvedValue(introduction({ tutorUserId: 4 }));
    await service.grant(7, 3, undefined, { tutorUserId: 4 });
    expect(store.setTutor).not.toHaveBeenCalled();
    await service.grant(7, 3, undefined, { tutorUserId: 5 });
    expect(store.setTutor).toHaveBeenCalledWith(10, 5);
  });

  it('records the acting user for a granted introduction', async () => {
    await service.grant(7, 3, { comment: 'Welcome' }, { performedByUserId: 9 });

    expect(store.addHistoryItem).toHaveBeenCalledWith(10, IntroductionHistoryAction.GRANT, 'Welcome', 9);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'introduction.granted',
        actor: expect.objectContaining({ id: 9 }),
        subject: expect.objectContaining({ id: 7 }),
        details: { recipientUserId: 3 },
      }),
    );
  });

  it('records a cleared event only when the renewed resource introduction was due', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    retraining.getIntroductionRetrainingStatus
      .mockResolvedValueOnce({ isDue: true })
      .mockResolvedValueOnce({ isDue: false });

    await service.grant(7, 3);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'retraining.cleared',
        subject: expect.objectContaining({ id: 7 }),
        details: { introductionId: 10, usageUserId: 3 },
      }),
    );
  });

  it('does not clear a resource introduction when inactivity remains due after renewal', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    retraining.getIntroductionRetrainingStatus.mockResolvedValue({ isDue: true });

    await service.grant(7, 3);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records the acting user for a revoked introduction', async () => {
    store.findOfUser.mockResolvedValue(introduction());

    await service.revoke(7, 3, undefined, { performedByUserId: 9 });

    expect(store.addHistoryItem).toHaveBeenCalledWith(10, IntroductionHistoryAction.REVOKE, undefined, 9);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'introduction.revoked',
        actor: expect.objectContaining({ id: 9 }),
      }),
    );
  });

  it('does not notify when a resource introduction is granted twice without an effective access change', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    store.lastHistoryItem.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });

    await service.grant(7, 3);

    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('notifies the user when a resource introduction is revoked', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    store.lastHistoryItem.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });
    await service.revoke(7, 3);

    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        body: 'Your introduction for resource #7 was revoked.',
        url: '/resources/7',
      }),
    );
  });

  it('does not notify when a resource introduction is revoked twice without an effective access change', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    store.lastHistoryItem.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.REVOKE });

    await service.revoke(7, 3);

    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('does not notify when revoking a resource introduction that was never granted', async () => {
    await service.revoke(7, 3);

    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('answers validity from the newest history item, inside the caller transaction when one is given', async () => {
    store.findOfUser.mockResolvedValue(introduction());
    store.lastHistoryItem.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });
    const context = {};

    expect(await service.hasValidIntroduction(7, 3, context)).toBe(true);
    expect(store.findOfUser).toHaveBeenCalledWith(7, 3, context);
    expect(store.lastHistoryItem).toHaveBeenCalledWith(10, context);

    store.findOfUser.mockResolvedValue(null);
    expect(await service.hasValidIntroduction(7, 3)).toBe(false);
  });

  it('lists introductions and history through the store', async () => {
    await service.getMany(7, true);
    expect(store.listForResource).toHaveBeenCalledWith(7, true);
    await service.getHistoryByResourceIdAndUserId(7, 3);
    expect(store.historyOfUser).toHaveBeenCalledWith(7, 3);
  });
});
