import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  Resource,
  ResourceIntroducer,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  User,
} from '@attraccess/database-entities';
import {
  MaintenanceRequestStatus,
  type ResourceMaintenanceRequestRecord,
  type ResourceNotificationRecipient,
} from '@attraccess/application-models';
import type {
  MaintenanceNotificationStore,
  MaintenanceRequestResolution,
  MaintenanceRequestStore,
  RequestForNotification,
} from '../../../resources/maintenances/maintenance-request-store.port';
import { toMaintenanceRequestRecord, toNotificationRecipient } from './maintenance-mappers';

const REQUEST_RELATIONS = ['createdByUser', 'resolvedByUser', 'resultingMaintenance'];

@Injectable()
export class TypeOrmMaintenanceRequestStore implements MaintenanceRequestStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async create(resourceId: number, createdByUserId: number, reason: string): Promise<ResourceMaintenanceRequestRecord> {
    const repository = this.dataSource.getRepository(ResourceMaintenanceRequest);
    const saved = await repository.save(
      repository.create({
        resource: { id: resourceId } as Resource,
        reason,
        status: MaintenanceRequestStatus.OPEN,
        createdByUser: { id: createdByUserId } as User,
      }),
    );
    return this.reload(saved.id);
  }

  async page(
    resourceId: number,
    status: MaintenanceRequestStatus,
    skip: number,
    take: number,
  ): Promise<{ data: ResourceMaintenanceRequestRecord[]; total: number }> {
    const [rows, total] = await this.dataSource.getRepository(ResourceMaintenanceRequest).findAndCount({
      where: { resourceId, status },
      relations: REQUEST_RELATIONS,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { data: rows.map(toMaintenanceRequestRecord), total };
  }

  async findById(requestId: number): Promise<ResourceMaintenanceRequestRecord | null> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenanceRequest)
      .findOne({ where: { id: requestId }, relations: REQUEST_RELATIONS });
    return entity ? toMaintenanceRequestRecord(entity) : null;
  }

  async resolve(
    requestId: number,
    resolution: MaintenanceRequestResolution,
  ): Promise<ResourceMaintenanceRequestRecord> {
    const repository = this.dataSource.getRepository(ResourceMaintenanceRequest);
    const request = await repository.findOneByOrFail({ id: requestId });
    if (resolution.resultingMaintenanceId !== undefined) {
      request.resultingMaintenance = { id: resolution.resultingMaintenanceId } as ResourceMaintenance;
    }
    request.status = resolution.status;
    request.resolvedByUser = { id: resolution.resolvedByUserId } as User;
    request.resolvedAt = resolution.resolvedAt;
    await repository.save(request);
    return this.reload(requestId);
  }

  private async reload(requestId: number): Promise<ResourceMaintenanceRequestRecord> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenanceRequest)
      .findOneOrFail({ where: { id: requestId }, relations: REQUEST_RELATIONS });
    return toMaintenanceRequestRecord(entity);
  }
}

@Injectable()
export class TypeOrmMaintenanceNotificationStore implements MaintenanceNotificationStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findRequest(requestId: number): Promise<RequestForNotification | null> {
    const request = await this.dataSource
      .getRepository(ResourceMaintenanceRequest)
      .findOne({ where: { id: requestId }, relations: ['createdByUser'] });
    if (!request) return null;
    return {
      id: request.id,
      reason: request.reason,
      createdByUsername: request.createdByUser?.username ?? null,
    };
  }

  async findResource(resourceId: number): Promise<{ id: number; name: string; groupIds: number[] } | null> {
    const resource = await this.dataSource
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, relations: ['groups'] });
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
    const rows = await this.dataSource.getRepository(ResourceIntroducer).find({ where, relations: ['user'] });
    return rows.filter((row) => row.user).map((row) => toNotificationRecipient(row.user));
  }
}
