import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Resource, ResourceIntroducer, User } from '@attraccess/database-entities';
import type { ResourceNotificationRecipient } from '@attraccess/application-models';
import type { ResourceRecipientStore } from '../../../resources/health/resource-health-store.port';
import { toNotificationRecipient } from './maintenance-mappers';

@Injectable()
export class TypeOrmResourceRecipientStore implements ResourceRecipientStore {
  constructor(@InjectDataSource() protected readonly dataSource: DataSource) {}

  async findResource(resourceId: number): Promise<{ id: number; name: string; groupIds: number[] } | null> {
    const resource = await this.dataSource
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, relations: { groups: true } });
    if (!resource) return null;
    return { id: resource.id, name: resource.name, groupIds: (resource.groups ?? []).map((group) => group.id) };
  }

  async findUsersByIds(userIds: number[]): Promise<ResourceNotificationRecipient[]> {
    const users = await this.dataSource.getRepository(User).findBy({ id: In(userIds) });
    return users.map(toNotificationRecipient);
  }

  async findIntroducerUsers(resourceId: number, groupIds: number[]): Promise<ResourceNotificationRecipient[]> {
    const where: Array<Record<string, unknown>> = [{ resourceId }];
    if (groupIds.length > 0) where.push({ resourceGroupId: In(groupIds) });
    const rows = await this.dataSource.getRepository(ResourceIntroducer).find({ where, relations: { user: true } });
    return rows.filter((row) => row.user).map((row) => toNotificationRecipient(row.user));
  }
}
