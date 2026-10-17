export const mockMetricsService = {
  resourcesTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageSessionsTotal: { inc: jest.fn() },
  resourceUsageDurationSeconds: { observe: jest.fn() },
  resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceIntroductionsTotal: { inc: jest.fn() },
  resourceMaintenanceTotal: { inc: jest.fn() },
  resourceMaintenanceOverdue: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};
