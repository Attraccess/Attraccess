import { Resource, ResourceType, SupervisionMode } from '@attraccess/react-query-client';

/**
 * Creates a mock resource with the given overrides
 */
export function createMockResource(overrides?: Partial<Resource>): Resource {
  return {
    id: 1,
    type: ResourceType.MACHINE,
    separateUnlockAndUnlatch: false,
    name: 'Test Resource',
    description: 'Test Description',
    imageFilename: 'test.jpg',
    allowTakeOver: false,
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: false,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groups: [],
    deletedAt: null,
    forms: [],
    ...overrides,
  };
}
