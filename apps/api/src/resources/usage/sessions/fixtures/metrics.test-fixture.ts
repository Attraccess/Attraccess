export const mockMetricsService = {
  resourceUsageSessionsTotal: { inc: jest.fn() },
  resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageDurationSeconds: { observe: jest.fn() },
  authorizationCacheRequestsTotal: { inc: jest.fn() },
  authorizationCacheSize: { set: jest.fn() },
};
