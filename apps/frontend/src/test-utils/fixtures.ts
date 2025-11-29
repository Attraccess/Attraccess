import { Resource, ResourceType } from '@attraccess/react-query-client';

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groups: [],
    deletedAt: null,
    forms: [],
    ...overrides,
  };
}
