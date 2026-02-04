import { Entity, Column, CreateDateColumn, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceSubFlowNode } from './resourceSubFlowNode';
import { ResourceSubFlowEdge } from './resourceSubFlowEdge';

@Entity()
export class ResourceSubFlow {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the sub-flow',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The name of the sub-flow',
    example: 'Notify usage updates',
  })
  name!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional description of the sub-flow',
    required: false,
    example: 'Reusable flow for sending MQTT updates.',
  })
  description!: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the sub-flow was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the sub-flow was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @OneToMany(() => ResourceSubFlowNode, (node) => node.subFlow)
  nodes!: ResourceSubFlowNode[];

  @OneToMany(() => ResourceSubFlowEdge, (edge) => edge.subFlow)
  edges!: ResourceSubFlowEdge[];
}
