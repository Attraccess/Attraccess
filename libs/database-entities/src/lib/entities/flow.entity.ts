import { Entity, Column, CreateDateColumn, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceFlowNode } from './resourceFlowNode';
import { ResourceFlowEdge } from './resourceFlowEdge';

import type { FlowScope } from '@attraccess/application-models';

export type { FlowScope };

/**
 * A named flow that is not tied to one resource. Its nodes and edges point here through `flowId`
 * (with `resourceId` NULL); resource flows keep using `resourceId` alone.
 */
@Entity()
export class Flow {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the flow', example: 1 })
  id!: number;

  @Column({ type: 'varchar' })
  @ApiProperty({ description: 'The name of the flow', example: 'Notify on starts' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'Optional description of what the flow does', nullable: true, type: String })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Disabled flows never run', example: true })
  enabled!: boolean;

  @Column({ type: 'varchar', default: 'global' })
  @ApiProperty({ description: 'The kind of flow', enum: ['resource', 'global'], example: 'global' })
  scope!: FlowScope;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @OneToMany(() => ResourceFlowNode, (node) => node.flow)
  nodes!: ResourceFlowNode[];

  @OneToMany(() => ResourceFlowEdge, (edge) => edge.flow)
  edges!: ResourceFlowEdge[];
}
