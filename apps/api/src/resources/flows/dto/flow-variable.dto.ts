import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { ResourceFlowVariableScope, ResourceFlowVariableValueType } from '@attraccess/database-entities';

export class FlowVariableDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  scope!: ResourceFlowVariableScope;
  @ApiProperty({ nullable: true, type: Number }) resourceId!: number | null;
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'Parsed JSON value', type: Object })
  value!: unknown;
  @ApiProperty() valueType!: ResourceFlowVariableValueType;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class FlowVariableUpsertDto {
  @ApiProperty({ description: 'Any JSON value', type: Object })
  @Allow()
  value!: unknown;
}
