import { ResourceRetrainingService, RetrainingPolicy } from './resourceRetraining.service';

describe('ResourceRetrainingService.evaluate', () => {
  let service: ResourceRetrainingService;

  const DAY = 24 * 60 * 60 * 1000;
  const trainedAt = new Date('2026-01-01T00:00:00.000Z');

  const policy = (overrides: Partial<RetrainingPolicy> = {}): RetrainingPolicy => ({
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: false,
    ...overrides,
  });

  beforeEach(() => {
    service = new ResourceRetrainingService(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
  });

  it('does not apply when no thresholds are configured', () => {
    const result = service.evaluate(policy(), trainedAt, null, new Date('2030-01-01T00:00:00.000Z'));
    expect(result.applies).toBe(false);
    expect(result.isDue).toBe(false);
  });

  it('becomes due once the max training age has passed', () => {
    const p = policy({ retrainingMaxAgeDays: 365 });
    const before = service.evaluate(p, trainedAt, null, new Date(trainedAt.getTime() + 364 * DAY));
    const after = service.evaluate(p, trainedAt, null, new Date(trainedAt.getTime() + 366 * DAY));

    expect(before.applies).toBe(true);
    expect(before.isDue).toBe(false);
    expect(after.isDue).toBe(true);
    expect(after.reason).toBe('age');
  });

  it('uses last usage as the inactivity baseline', () => {
    const p = policy({ retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date('2026-06-01T00:00:00.000Z');

    const fresh = service.evaluate(p, trainedAt, lastUsedAt, new Date(lastUsedAt.getTime() + 29 * DAY));
    const stale = service.evaluate(p, trainedAt, lastUsedAt, new Date(lastUsedAt.getTime() + 31 * DAY));

    expect(fresh.isDue).toBe(false);
    expect(stale.isDue).toBe(true);
    expect(stale.reason).toBe('inactivity');
  });

  it('falls back to trainedAt for inactivity when there is no usage', () => {
    const p = policy({ retrainingMaxInactivityDays: 30 });
    const result = service.evaluate(p, trainedAt, null, new Date(trainedAt.getTime() + 31 * DAY));
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
  });

  it('reports the soonest trigger when both are configured', () => {
    const p = policy({ retrainingMaxAgeDays: 365, retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date(trainedAt.getTime() + 10 * DAY);

    const result = service.evaluate(p, trainedAt, lastUsedAt, new Date(trainedAt.getTime() + 45 * DAY));
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
    expect(result.dueAt?.getTime()).toBe(lastUsedAt.getTime() + 30 * DAY);
  });

  it('passes through the blocksAccess flag', () => {
    const p = policy({ retrainingMaxAgeDays: 1, retrainingBlocksAccess: true });
    const result = service.evaluate(p, trainedAt, null, new Date(trainedAt.getTime() + 2 * DAY));
    expect(result.blocksAccess).toBe(true);
  });

  it('records a system-origin required transition when the scheduled evaluation first notifies', async () => {
    const audit = { hasResourceIntroductionEvent: jest.fn().mockResolvedValue(false), recordResource: jest.fn().mockResolvedValue(undefined) };
    const introductionRepository = { update: jest.fn().mockResolvedValue(undefined) };
    const service = new ResourceRetrainingService(
      { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Lathe', retrainingMaxAgeDays: 1, retrainingMaxInactivityDays: null, retrainingBlocksAccess: true }) } as never,
      null as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      introductionRepository as never,
      { findOne: jest.fn().mockResolvedValue({ createdAt: trainedAt }) } as never,
      null as never,
      null as never,
      audit as never,
    );

    await (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingNotifiedAt: null },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.recordResource).toHaveBeenCalledWith({
      action: 'retraining.required',
      actorId: null,
      subjectId: 1,
      details: { introductionId: 3, usageUserId: 2, retrainingReason: 'age' },
    });
  });

  it('retries failed email delivery without marking the notification delivered', async () => {
    const audit = { hasResourceIntroductionEvent: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), recordResource: jest.fn().mockResolvedValue(undefined) };
    const introductionRepository = { update: jest.fn().mockResolvedValue(undefined) };
    const email = { sendUserRetrainingEmail: jest.fn().mockRejectedValueOnce(new Error('SMTP unavailable')).mockResolvedValueOnce(undefined) };
    const service = new ResourceRetrainingService(
      { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Lathe', retrainingMaxAgeDays: 1, retrainingMaxInactivityDays: null, retrainingBlocksAccess: true }) } as never,
      null as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      introductionRepository as never,
      { findOne: jest.fn().mockResolvedValue({ createdAt: trainedAt }) } as never,
      null as never,
      email as never,
      audit as never,
    );
    const notify = (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue.bind(service);
    const introduction = { id: 3, resourceId: 1, receiverUserId: 2, receiverUser: { email: 'user@example.com' }, retrainingNotifiedAt: null };

    await expect(notify(introduction, new Date('2026-01-03T00:00:00.000Z'))).rejects.toThrow('SMTP unavailable');
    expect(introductionRepository.update).not.toHaveBeenCalled();
    await notify(introduction, new Date('2026-01-04T00:00:00.000Z'));
    expect(email.sendUserRetrainingEmail).toHaveBeenCalledTimes(2);
    expect(audit.recordResource).toHaveBeenCalledTimes(1);
    expect(audit.hasResourceIntroductionEvent).toHaveBeenLastCalledWith('retraining.required', 3, 1, trainedAt, 'resource');
    expect(introductionRepository.update).toHaveBeenCalledWith(3, expect.objectContaining({ retrainingNotifiedAt: expect.any(Date) }));
  });
});
