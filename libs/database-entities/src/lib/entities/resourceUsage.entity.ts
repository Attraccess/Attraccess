import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceUsageAction } from './resourceUsage.type';

@Entity()
export class ResourceUsage {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource usage',
    example: 1,
  })
  id!: number;

  @Column({ type: 'simple-enum', enum: ResourceUsageAction })
  @ApiProperty({
    description: 'The type of usage',
    example: ResourceUsageAction.Usage,
    enum: ResourceUsageAction,
  })
  usageAction!: ResourceUsageAction;

  @Column({
    type: 'integer',
  })
  @ApiProperty({
    description: 'The ID of the resource being used',
    example: 1,
  })
  resourceId!: number;

  @Column({ nullable: true, type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user using the resource (null if user was deleted)',
    example: 1,
    required: false,
  })
  userId!: number | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the usage session started',
  })
  startTime!: Date;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Notes provided when starting the session',
    example: 'Starting prototype development for client XYZ',
    required: false,
  })
  startNotes!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the usage session ended',
    required: false,
  })
  endTime!: Date | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Notes provided when ending the session',
    example: 'Completed initial prototype, material usage: 500g',
    required: false,
  })
  endNotes!: string | null;

  @ManyToOne(() => Resource, (resource) => resource.usages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being used',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;

  @ManyToOne(() => User, (user) => user.resourceUsages, { nullable: true })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({
    description: 'The user who used the resource',
    required: false,
    type: () => User,
  })
  user!: User | null;

  @Column({
    generatedType: 'STORED',
    asExpression: `CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END`,
    insert: false,
    update: false,
    type: 'integer',
  })
  @ApiProperty({
    description: 'The duration of the usage session in minutes',
    example: 120,
  })
  usageInMinutes!: number;
}
