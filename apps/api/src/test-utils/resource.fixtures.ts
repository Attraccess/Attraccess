import { DocumentationType, Resource, ResourceType } from '@attraccess/database-entities';

export function createMockResource(overrides: Partial<Resource> = {}): Resource {
  const now = new Date();
  const base: Resource = {
    id: 1,
    name: 'Test Resource',
    type: ResourceType.Machine,
    separateUnlockAndUnlatch: false,
    description: 'Test Description',
    imageFilename: null,
    documentationType: DocumentationType.MARKDOWN,
    documentationMarkdown: '# Test Documentation\n\nThis is a test documentation.',
    documentationUrl: null,
    allowTakeOver: false,
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: false,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    introductions: [],
    usages: [],
    introducers: [],
    groups: [],
    flowNodes: [],
    flowEdges: [],
    flowLogs: [],
    flowVariables: [],
    attractapReaders: [],
    maintenances: [],
    maintenanceSchedules: [],
    billingConfigurations: [],
    forms: [],
  };

  return { ...base, ...overrides } as Resource;
}
