import { ResourceRetrainingService } from './resourceRetraining.service';
import { IntroductionHistoryAction } from '@attraccess/database-entities';
import { registerResourceRetrainingServiceEvaluateFixture } from './resourceRetraining.service.resource-retraining-service-evaluate.test-fixture';

export function registerRetriesFailedEmailDeliveryWithoutMarkingTheNotificationDeliveredCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('retries failed email delivery without marking the notification delivered', async () => {
    const audit = { recordResource: jest.fn().mockResolvedValue(true) };
    const introductionRepository = { update: jest.fn().mockResolvedValue(undefined) };
    const email = {
      sendUserRetrainingEmail: jest
        .fn()
        .mockRejectedValueOnce(new Error('SMTP unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const service = new ResourceRetrainingService(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          name: 'Lathe',
          retrainingMaxAgeDays: 1,
          retrainingMaxInactivityDays: null,
          retrainingBlocksAccess: true,
        }),
      } as never,
      null as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      introductionRepository as never,
      {
        findOne: jest.fn().mockResolvedValue({ createdAt: fixture.trainedAt, action: IntroductionHistoryAction.GRANT }),
      } as never,
      null as never,
      email as never,
      audit as never,
    );
    const notify = (
      service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }
    ).notifyIfDue.bind(service);
    const introduction = {
      id: 3,
      resourceId: 1,
      receiverUserId: 2,
      receiverUser: { email: 'user@example.com' },
      retrainingNotifiedAt: null,
      retrainingRequiredAuditedAt: new Date('2026-01-03T00:00:00.000Z'),
    };

    await expect(notify(introduction, new Date('2026-01-03T00:00:00.000Z'))).rejects.toThrow('SMTP unavailable');
    expect(introductionRepository.update).not.toHaveBeenCalledWith(
      3,
      expect.objectContaining({ retrainingNotifiedAt: expect.any(Date) }),
    );
    await notify(introduction, new Date('2026-01-04T00:00:00.000Z'));
    expect(email.sendUserRetrainingEmail).toHaveBeenCalledTimes(2);
    expect(audit.recordResource).not.toHaveBeenCalled();
    expect(introductionRepository.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ retrainingNotifiedAt: expect.any(Date) }),
    );
  });
}

export function registerUsesLastUsageAsTheInactivityBaselineCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('uses last usage as the inactivity baseline', () => {
    const p = fixture.policy({ retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date('2026-06-01T00:00:00.000Z');

    const fresh = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(lastUsedAt.getTime() + 29 * fixture.DAY),
    );
    const stale = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(lastUsedAt.getTime() + 31 * fixture.DAY),
    );

    expect(fresh.isDue).toBe(false);
    expect(stale.isDue).toBe(true);
    expect(stale.reason).toBe('inactivity');
  });
}

export function registerUsesTheIntroductionMarkerAfterAuditRetentionHasRemovedTheAuditRowCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('uses the introduction marker after audit retention has removed the audit row', async () => {
    const audit = { recordResource: jest.fn().mockResolvedValue(true) };
    const service = new ResourceRetrainingService(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          name: 'Lathe',
          retrainingMaxAgeDays: 1,
          retrainingMaxInactivityDays: null,
          retrainingBlocksAccess: true,
        }),
      } as never,
      null as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { update: jest.fn() } as never,
      {
        findOne: jest.fn().mockResolvedValue({ createdAt: fixture.trainedAt, action: IntroductionHistoryAction.GRANT }),
      } as never,
      null as never,
      null as never,
      audit as never,
    );

    await (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingRequiredAuditedAt: fixture.trainedAt },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.recordResource).not.toHaveBeenCalled();
  });
}
