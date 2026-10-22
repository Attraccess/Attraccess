import { ResourceRetrainingPersistence } from './port';

export function retrainingOperationsFake(
  overrides: Partial<jest.Mocked<ResourceRetrainingPersistence>> = {},
): jest.Mocked<ResourceRetrainingPersistence> {
  return {
    introduction: jest.fn(),
    resourceIntroduction: jest.fn(),
    groupIntroduction: jest.fn(),
    resource: jest.fn(),
    group: jest.fn(),
    groupWithResources: jest.fn(),
    latestHistory: jest.fn(),
    resourceLastUsedAt: jest.fn(),
    resourcesLastUsedAt: jest.fn(),
    configuredIntroductions: jest.fn(),
    stampRequiredAudit: jest.fn(),
    stampNotification: jest.fn(),
    ...overrides,
  };
}
