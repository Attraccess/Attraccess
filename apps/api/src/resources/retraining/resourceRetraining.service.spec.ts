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
});
