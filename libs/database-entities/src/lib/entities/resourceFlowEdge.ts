import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

@Entity()
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

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The target node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  target!: string;

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

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the resource that this node belongs to',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.flowEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this edge belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
}
