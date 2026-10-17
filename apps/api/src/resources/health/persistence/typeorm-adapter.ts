import {
  Resource,
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceIntroducer,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { NewHealthEntry, ResourceHealthPersistence, ResourceHealthRecipients } from './port';

@Injectable()
export class TypeormResourceHealthPersistence extends ResourceHealthPersistence {
  constructor(
    @InjectRepository(ResourceHealthState) private readonly entries: Repository<ResourceHealthState>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {
    super();
  }
  async findEntry(resourceId: number, identifier: string): Promise<ResourceHealthState | null> {
    return toApplicationRecord(await this.entries.findOne({ where: { resourceId, identifier } }));
  }
  async findEntryById(resourceId: number, entryId: number): Promise<ResourceHealthState | null> {
    return toApplicationRecord(await this.entries.findOne({ where: { id: entryId, resourceId } }));
  }
  async storeEntry(record: NewHealthEntry | ResourceHealthState): Promise<ResourceHealthState> {
    const entity = 'id' in record ? record : this.entries.create(record);
    return toApplicationRecord(await this.entries.save(entity));
  }
  async listEntries(resourceIds: readonly number[]): Promise<ResourceHealthState[]> {
    if (!resourceIds.length) return [];
    return toApplicationRecord(
      await this.entries.find({
        where: { resourceId: resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]) },
        order: { identifier: 'ASC' },
      }),
    );
  }
  async findResource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId } }));
  }
  countUnhealthy(resourceId: number): Promise<number> {
    return this.entries.count({ where: { resourceId, status: ResourceHealthStatus.UNHEALTHY } });
  }
  async removeEntry(entry: ResourceHealthState): Promise<void> {
    await this.entries.remove(entry);
  }
}

@Injectable()
export class TypeormResourceHealthRecipients extends ResourceHealthRecipients {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceIntroducer) private readonly introducers: Repository<ResourceIntroducer>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async resourceWithGroups(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId }, relations: ['groups'] }));
  }
  async usersByIds(userIds: readonly number[]): Promise<User[]> {
    return userIds.length ? toApplicationRecord(await this.users.findBy({ id: In([...userIds]) })) : [];
  }
  async introducersForResource(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]> {
    return toApplicationRecord(
      await this.introducers.find({
        where: [{ resourceId }, ...(groupIds.length ? [{ resourceGroupId: In([...groupIds]) }] : [])],
        relations: ['user'],
      }),
    );
  }
}
