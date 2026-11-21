import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { formatUserDisplayName } from '@attraccess/shared';
import { Resource, ResourceMaintenance, ResourceMaintenanceRequest, User } from '@attraccess/database-entities';
import { MaintenanceRequestStatus, type ResourceMaintenanceRequestRecord } from '@attraccess/application-models';
import type {
  MaintenanceNotificationStore,
  MaintenanceRequestResolution,
  MaintenanceRequestStore,
  RequestForNotification,
} from '../../../resources/maintenances/maintenance-request-store.port';
import { toMaintenanceRequestRecord } from './maintenance-mappers';
import { TypeOrmResourceRecipientStore } from './resource-recipient-store.adapter';
import { findRelations } from '../find-options';

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
      relations: findRelations(REQUEST_RELATIONS),
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { data: rows.map(toMaintenanceRequestRecord), total };
  }

  async findById(requestId: number): Promise<ResourceMaintenanceRequestRecord | null> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenanceRequest)
      .findOne({ where: { id: requestId }, relations: findRelations(REQUEST_RELATIONS) });
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
      .findOneOrFail({ where: { id: requestId }, relations: findRelations(REQUEST_RELATIONS) });
    return toMaintenanceRequestRecord(entity);
  }
}

@Injectable()
export class TypeOrmMaintenanceNotificationStore implements MaintenanceNotificationStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly recipients: TypeOrmResourceRecipientStore,
  ) {}

  async findRequest(requestId: number): Promise<RequestForNotification | null> {
    const request = await this.dataSource
      .getRepository(ResourceMaintenanceRequest)
      .findOne({ where: { id: requestId }, relations: { createdByUser: true } });
    if (!request) return null;
    return {
      id: request.id,
      reason: request.reason,
      createdByUsername: request.createdByUser?.username ?? null,
      createdByDisplayName: request.createdByUser ? formatUserDisplayName(request.createdByUser) : null,
    };
  }

  findResource(resourceId: number) {
    return this.recipients.findResource(resourceId);
  }

  findUsersByIds(userIds: number[]) {
    return this.recipients.findUsersByIds(userIds);
  }

  findIntroducerUsers(resourceId: number, groupIds: number[]) {
    return this.recipients.findIntroducerUsers(resourceId, groupIds);
  }
}
