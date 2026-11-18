import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Resource, ResourceMeter } from '@attraccess/database-entities';
import type { FlowResourceRecord } from '@attraccess/application-models';
import type { FlowResourceDirectory } from '../../../resources/flows/flow-resource-directory.port';
import { toFlowResourceRecord } from './flow-mappers';

@Injectable()
export class TypeOrmFlowResourceDirectory implements FlowResourceDirectory {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(resourceId: number): Promise<FlowResourceRecord | null> {
    const resource = await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } });
    return resource ? toFlowResourceRecord(resource) : null;
  }

  async meterIds(resourceId: number): Promise<number[]> {
    const meters = await this.dataSource.manager.find(ResourceMeter, { where: { resourceId }, select: { id: true } });
    return meters.map((meter) => meter.id);
  }
}
