import {
  Check,
  Entity,
  Index,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { Flow } from './flow.entity';

@Entity()
@Index('IDX_resource_flow_edge_flow', ['flowId'])
// Every node step looks up the edges leaving it.
@Index('IDX_resource_flow_edge_source', ['source'])
// Exactly one owner: a resource flow or a global flow.
@Check('CHK_resource_flow_edge_owner', '("resourceId" IS NULL) <> ("flowId" IS NULL)')
export class ResourceFlowEdge {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'The unique identifier of the resource flow edge',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  id!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The source node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  source!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The source handle id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  sourceHandle!: string | null;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The target node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  target!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The target handle id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  targetHandle!: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the node was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the node was last updated',
  })
  updatedAt!: Date;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The id of the resource that this node belongs to; null for global-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  resourceId!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The id of the global flow that this node belongs to; null for resource-flow nodes',
    example: 1,
    nullable: true,
    type: Number,
  })
  flowId!: number | null;

  @ManyToOne(() => Flow, (flow) => flow.edges, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'flowId', foreignKeyConstraintName: 'FK_resource_flow_edge_flow' })
  flow!: Flow | null;

  @ManyToOne(() => Resource, (resource) => resource.flowEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this edge belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource | null;
}
