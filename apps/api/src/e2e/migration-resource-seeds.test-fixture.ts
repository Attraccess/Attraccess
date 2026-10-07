import {
  AuditLog,
  Project,
  Resource,
  ResourceGroup,
  ResourceOperatingInterval,
  ResourceType,
  User,
} from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import { ensureEntity } from './migration-seed-storage.test-fixture';
export async function migrationResourceSeeds(dataSource: DataSource, seedTag: string, primaryUser: User) {
  const resourceGroupRepo = dataSource.getRepository(ResourceGroup);

  const resourceRepo = dataSource.getRepository(Resource);

  const operatingIntervalRepo = dataSource.getRepository(ResourceOperatingInterval);

  const projectRepo = dataSource.getRepository(Project);

  await ensureEntity(dataSource.getRepository(AuditLog), () => ({
    at: new Date(),
    domain: 'demo',
    pluginId: 'abcdefghijklmnopqrstu',
    action: 'demo.publication',
    operationId: '00000000-0000-4000-8000-000000000001',
    actorId: primaryUser.id,
    authenticationMethod: 'session',
    apiTokenId: null,
    outcome: 'succeeded',
    subjectType: 'demo.device',
    subjectId: 7,
    details: { revision: 1 },
  }));

  const resourceGroup = await ensureEntity(resourceGroupRepo, () => ({
    name: `Seed Group ${seedTag}`,
    description: 'Seed resource group',
  }));

  const resource = await ensureEntity(resourceRepo, () => ({
    name: `Seed Resource ${seedTag}`,
    type: ResourceType.Machine,
    description: 'Seed resource',
    allowTakeOver: false,
    separateUnlockAndUnlatch: false,
  }));

  await ensureEntity(operatingIntervalRepo, () => ({
    resourceId: resource.id,
    startTime: new Date(),
    endTime: null,
  }));

  const project = await ensureEntity(projectRepo, () => ({
    name: `Seed Project ${seedTag}`,
    description: 'Seed project',
    owner: primaryUser,
  }));
  return { resourceGroup, resource, project };
}
