import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { FormTemplate } from './formTemplate.entity';

export enum ResourceActionType {
  START = 'start',
  STOP = 'stop',
  TAKEOVER = 'takeover',
}

@Entity()
@Index(['resourceId', 'actionType', 'sortOrder'])
@Index(['resourceId', 'templateId', 'actionType'], { unique: true })
@Index(['isActive'])
export class ResourceFormAssignment {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource form assignment',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the resource this assignment belongs to',
    example: 1,
  })
  resourceId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the form template assigned to the resource',
    example: 1,
  })
  templateId!: number;

  @Column({
    type: 'simple-enum',
    enum: ResourceActionType,
  })
  @ApiProperty({
    description: 'The resource action type this form is required for',
    enum: ResourceActionType,
    example: ResourceActionType.START,
  })
  actionType!: ResourceActionType;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description: 'Whether this form assignment is active',
    example: true,
    default: true,
  })
  isActive!: boolean;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({
    description: 'The sort order for multiple forms assigned to the same action',
    example: 0,
    default: 0,
  })
  sortOrder!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource this assignment belongs to',
    type: () => Resource,
  })
  resource!: Resource;

  @ManyToOne(() => FormTemplate, (template) => template.assignments, { 
    onDelete: 'CASCADE' 
  })
  @JoinColumn({ name: 'templateId' })
  @ApiProperty({
    description: 'The form template assigned to the resource',
    type: () => FormTemplate,
  })
  template!: FormTemplate;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the form assignment was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the form assignment was last updated',
  })
  updatedAt!: Date;
}