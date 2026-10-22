import { ResourceCatalogPersistence } from './port';
export function resourceCatalogOperationsFake(): jest.Mocked<ResourceCatalogPersistence> {
  return {
    resourcesByIds: jest.fn(),
    catalogPage: jest.fn().mockResolvedValue([[], 0]),
    resourceCount: jest.fn().mockResolvedValue(0),
    createResource: jest.fn(),
    saveResource: jest.fn(),
    removeResource: jest.fn(),
    softDeleteResource: jest.fn(),
  };
}
