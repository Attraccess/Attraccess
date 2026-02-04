import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceSubFlow } from './resourceSubFlow';

@Entity()
export class ResourceSubFlowEdge {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'The unique identifier of the sub-flow edge',
    example: 'edge-1',
  })
  id!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The source node id',
    example: 'node-1',
  })
  source!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The source handle id',
    example: 'output',
  })
  sourceHandle!: string | null;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The target node id',
    example: 'node-2',
  })
  target!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The target handle id',
    example: 'input',
  })
  targetHandle!: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the edge was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the edge was last updated',
  })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the sub-flow that this edge belongs to',
    example: 1,
  })
  subFlowId!: number;

  @ManyToOne(() => ResourceSubFlow, (subFlow) => subFlow.edges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subFlowId' })
  @ApiProperty({
    description: 'The sub-flow this edge belongs to',
    type: () => ResourceSubFlow,
    required: false,
  })
  subFlow!: ResourceSubFlow;
}
