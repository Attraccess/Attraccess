import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

export enum ResourceFlowVariableScope {
  RESOURCE = 'resource',
  GLOBAL = 'global',
}

export type ResourceFlowVariableValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

@Entity()
@Unique('UQ_resource_flow_variable_scope_resource_key', ['scope', 'resourceId', 'key'])
@Index('IDX_resource_flow_variable_resource', ['resourceId'])
export class ResourceFlowVariable {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Internal id', example: 1 })
  id!: number;

  @Column({ type: 'varchar' })
  @ApiProperty({ enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  scope!: ResourceFlowVariableScope;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Owning resource id, null when scope=global', nullable: true })
  resourceId!: number | null;

  @Column({ type: 'varchar' })
  @ApiProperty({ description: 'Variable key' })
  key!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'JSON-stringified value' })
  value!: string;

  @Column({ type: 'varchar' })
  @ApiProperty({ description: 'Value JSON type tag' })
  valueType!: ResourceFlowVariableValueType;

  @CreateDateColumn()
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ManyToOne(() => Resource, (resource) => resource.flowVariables, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource | null;
}
