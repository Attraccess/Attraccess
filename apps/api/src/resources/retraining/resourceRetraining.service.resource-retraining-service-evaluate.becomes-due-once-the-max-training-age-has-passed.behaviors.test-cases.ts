import { registerResourceRetrainingServiceEvaluateFixture } from './resourceRetraining.service.resource-retraining-service-evaluate.test-fixture';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { IntroductionHistoryAction } from '@attraccess/database-entities';

export function registerBecomesDueOnceTheMaxTrainingAgeHasPassedCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('becomes due once the max training age has passed', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 365 });
    const before = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 364 * fixture.DAY),
    );
    const after = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 366 * fixture.DAY),
    );

    expect(before.applies).toBe(true);
    expect(before.isDue).toBe(false);
    expect(after.isDue).toBe(true);
    expect(after.reason).toBe('age');
  });
}

export function registerDoesNotApplyWhenNoThresholdsAreConfiguredCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('does not apply when no thresholds are configured', () => {
    const result = fixture.service.evaluate(
      fixture.policy(),
      fixture.trainedAt,
      null,
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(result.applies).toBe(false);
    expect(result.isDue).toBe(false);
  });
}

export function registerDoesNotRecordRetrainingForARevokedIntroductionCases(
  _fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('does not record retraining for a revoked introduction', async () => {
    const audit = { recordResource: jest.fn().mockResolvedValue(true) };
    const service = new ResourceRetrainingService(
      null as never,
      null as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { update: jest.fn() } as never,
      { findOne: jest.fn().mockResolvedValue({ action: IntroductionHistoryAction.REVOKE }) } as never,
      null as never,
      null as never,
      audit as never,
    );

    await (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
      { id: 3, resourceId: 1, receiverUserId: 2 },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.recordResource).not.toHaveBeenCalled();
  });
}

export function registerFallsBackToTrainedAtForInactivityWhenThereIsNoUsageCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('falls back to trainedAt for inactivity when there is no usage', () => {
    const p = fixture.policy({ retrainingMaxInactivityDays: 30 });
    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 31 * fixture.DAY),
    );
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
  });
}

export function registerPassesThroughTheBlocksAccessFlagCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('passes through the blocksAccess flag', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 1, retrainingBlocksAccess: true });
    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 2 * fixture.DAY),
    );
    expect(result.blocksAccess).toBe(true);
  });
}

export function registerRecordsASystemOriginRequiredTransitionWhenTheScheduledEvaluationFirstNotifCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('records a system-origin required transition when the scheduled evaluation first notifies', async () => {
    const audit = { recordResource: jest.fn().mockResolvedValue(true) };
    const introductionRepository = { update: jest.fn().mockResolvedValue(undefined) };
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
      null as never,
      audit as never,
    );

    await (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingNotifiedAt: null, retrainingRequiredAuditedAt: null },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.recordResource).toHaveBeenCalledWith({
      action: 'retraining.required',
      actorId: null,
      subjectId: 1,
      details: { introductionId: 3, usageUserId: 2, retrainingReason: 'age' },
    });
    expect(introductionRepository.update).toHaveBeenCalledWith(3, { retrainingRequiredAuditedAt: expect.any(Date) });
  });
}

export function registerReportsTheSoonestTriggerWhenBothAreConfiguredCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('reports the soonest trigger when both are configured', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 365, retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date(fixture.trainedAt.getTime() + 10 * fixture.DAY);

    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(fixture.trainedAt.getTime() + 45 * fixture.DAY),
    );
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
    expect(result.dueAt?.getTime()).toBe(lastUsedAt.getTime() + 30 * fixture.DAY);
  });
}

export function registerRetriesAMissingRequiredEventAfterTheEmailHasBeenDeliveredCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceEvaluateFixture>,
) {
  it('retries a missing required event after the email has been delivered', async () => {
    const audit = { recordResource: jest.fn().mockResolvedValue(true) };
    const introductionRepository = { update: jest.fn() };
    const email = { sendUserRetrainingEmail: jest.fn() };
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

    await (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
      {
        id: 3,
        resourceId: 1,
        receiverUserId: 2,
        receiverUser: { email: 'user@example.com' },
        retrainingNotifiedAt: new Date('2026-01-03T00:00:00.000Z'),
        retrainingRequiredAuditedAt: null,
      },
      new Date('2026-01-04T00:00:00.000Z'),
    );

    expect(audit.recordResource).toHaveBeenCalledTimes(1);
    expect(email.sendUserRetrainingEmail).not.toHaveBeenCalled();
    expect(introductionRepository.update).toHaveBeenCalledWith(3, { retrainingRequiredAuditedAt: expect.any(Date) });
  });
}
