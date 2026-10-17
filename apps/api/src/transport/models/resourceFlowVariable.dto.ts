import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { ResourceFlowVariableScope, ResourceFlowVariableValueType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceFlowVariable {
  @ApiProperty({ description: 'Internal id', example: 1 })
  id!: number;

  @ApiProperty({ enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  scope!: ResourceFlowVariableScope;

  @ApiProperty({ description: 'Owning resource id, null when scope=global', nullable: true })
  resourceId!: number | null;

  @ApiProperty({ description: 'Variable key' })
  key!: string;

  @ApiProperty({ description: 'JSON-stringified value' })
  value!: string;

  @ApiProperty({ type: String, description: 'Value JSON type tag' })
  valueType!: ResourceFlowVariableValueType;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  resource!: Resource | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    scope: null,
    resourceId: null,
    key: null,
    value: null,
    valueType: null,
    createdAt: null,
    updatedAt: null,
    resource: () => Resource,
  };
}

export { ResourceFlowVariableScope, ResourceFlowVariableValueType } from '@attraccess/application-models';
