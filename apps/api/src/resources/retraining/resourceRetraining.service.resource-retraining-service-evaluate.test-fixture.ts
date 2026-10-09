import { ResourceRetrainingService, RetrainingPolicy } from './resourceRetraining.service';

export function registerResourceRetrainingServiceEvaluateFixture() {
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
  return {
    get service() {
      return service;
    },
    get DAY() {
      return DAY;
    },
    get trainedAt() {
      return trainedAt;
    },
    get policy() {
      return policy;
    },
  };
}
