import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceSubFlow } from './resourceSubFlow';
import { ResourceFlowNodePosition, ResourceFlowNodeType } from './resourceFlowNode';

@Entity()
export class ResourceSubFlowNode {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'The unique identifier of the sub-flow node',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  id!: string;

  @Column({
    type: 'simple-enum',
    enum: ResourceFlowNodeType,
  })
  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.INPUT_SUBFLOW,
    enum: ResourceFlowNodeType,
    enumName: 'ResourceFlowNodeType',
  })
  type!: ResourceFlowNodeType;

  @Column(() => ResourceFlowNodePosition)
  @ApiProperty({
    description: 'The position of the node',
    example: { x: 100, y: 100 },
  })
  position!: ResourceFlowNodePosition;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: { name: 'input' },
  })
  data!: Record<string, unknown>;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the node was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the node was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the sub-flow that this node belongs to',
    example: 1,
  })
  subFlowId!: number;

  @ManyToOne(() => ResourceSubFlow, (subFlow) => subFlow.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subFlowId' })
  @ApiProperty({
    description: 'The sub-flow this node belongs to',
    type: () => ResourceSubFlow,
    required: false,
  })
  subFlow!: ResourceSubFlow;
}
