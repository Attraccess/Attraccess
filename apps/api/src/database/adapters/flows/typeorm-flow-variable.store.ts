import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import { ResourceFlowVariable } from '@attraccess/database-entities';
import {
  ResourceFlowVariableScope,
  type FlowVariableRecord,
  type ResourceFlowVariableValueType,
} from '@attraccess/application-models';
import type { FlowVariableKey, FlowVariableStore } from '../../../resources/flows/flow-variable-store.port';
import { toVariableRecord } from './flow-mappers';

@Injectable()
export class TypeOrmFlowVariableStore implements FlowVariableStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repository() {
    return this.dataSource.getRepository(ResourceFlowVariable);
  }

  async find({ scope, resourceId, key }: FlowVariableKey): Promise<FlowVariableRecord | null> {
    const row = await this.repository.findOne({ where: { scope, resourceId: resourceId ?? IsNull(), key } });
    return row ? toVariableRecord(row) : null;
  }

  async findMany(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: string[],
  ): Promise<FlowVariableRecord[]> {
    const rows = await this.repository.find({ where: { scope, resourceId: resourceId ?? IsNull(), key: In(keys) } });
    return rows.map(toVariableRecord);
  }

  async findVisibleTo(resourceId: number | null): Promise<FlowVariableRecord[]> {
    const rows = await this.repository.find({
      where: [
        { scope: ResourceFlowVariableScope.GLOBAL, resourceId: IsNull() },
        ...(resourceId == null ? [] : [{ scope: ResourceFlowVariableScope.RESOURCE, resourceId }]),
      ],
    });
    return rows.map(toVariableRecord);
  }

  async listForResource(resourceId: number): Promise<FlowVariableRecord[]> {
    const rows = await this.repository.find({
      where: [
        { scope: ResourceFlowVariableScope.GLOBAL, resourceId: IsNull() },
        { scope: ResourceFlowVariableScope.RESOURCE, resourceId },
      ],
      order: { scope: 'ASC', key: 'ASC' },
    });
    return rows.map(toVariableRecord);
  }

  async save(
    { scope, resourceId, key }: FlowVariableKey,
    serializedValue: string,
    valueType: ResourceFlowVariableValueType,
    existing: FlowVariableRecord | null,
  ): Promise<FlowVariableRecord> {
    const row = await this.repository.save({
      ...(existing ?? {}),
      scope,
      resourceId,
      key,
      value: serializedValue,
      valueType,
    });
    return toVariableRecord(row as ResourceFlowVariable);
  }

  async delete({ scope, resourceId, key }: FlowVariableKey): Promise<boolean> {
    // A plain `null` would compare `resourceId = NULL`, which matches no global variable.
    const result = await this.repository.delete({ scope, resourceId: resourceId ?? IsNull(), key });
    return Boolean(result.affected);
  }
}
