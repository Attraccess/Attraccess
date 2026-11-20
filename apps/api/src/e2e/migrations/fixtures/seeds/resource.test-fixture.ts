import {
  AuditLog,
  Project,
  Resource,
  ResourceGroup,
  ResourceOperatingInterval,
  User,
} from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { ensureEntity } from '../seed-storage.test-fixture';
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

  // An access-only door (DoorAccessOnly1793750000000), which the plugin reader seed is assigned to.
  const accessOnlyDoor =
    (await resourceRepo.findOne({ where: { accessOnly: true } })) ??
    (await resourceRepo.save(
      resourceRepo.create({
        name: `Seed Access-Only Door ${seedTag}`,
        type: ResourceType.Door,
        description: 'Seed access-only door',
        allowTakeOver: false,
        separateUnlockAndUnlatch: false,
        accessOnly: true,
      }),
    ));

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
  return { resourceGroup, resource, accessOnlyDoor, project };
}
