import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceIntroductionHistoryItem } from './resourceIntroductionHistoryItem.entity';
import { ResourceGroup } from './resourceGroup.entity';

@Index('IDX_resource_introduction_resourceId', ['resourceId'])
@Index('IDX_resource_introduction_receiverUserId', ['receiverUserId'])
@Index('IDX_resource_introduction_resourceGroupId', ['resourceGroupId'])
@Entity()
export class ResourceIntroduction {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the introduction',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The ID of the resource (if this is a resource-specific introduction)',
    example: 1,
    required: false,
  })
  resourceId!: number | null;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user who received the introduction',
    example: 1,
  })
  receiverUserId!: number;

  @Column({ nullable: true, type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user who tutored the receiver',
    example: 2,
  })
  tutorUserId!: number;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The ID of the resource group (if this is a group-level introduction)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  @ApiProperty({
    description: 'When the introduction was completed',
    example: '2021-01-01T00:00:00.000Z',
  })
  completedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the user was last notified that retraining is due (used to avoid repeat notifications)',
    example: '2021-01-01T00:00:00.000Z',
    required: false,
    nullable: true,
  })
  retrainingNotifiedAt!: Date | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the introduction record was created',
    example: '2021-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  @ManyToOne(() => Resource, (resource) => resource.introductions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @ManyToOne(() => User, (user) => user.resourceIntroductions)
  @JoinColumn({ name: 'receiverUserId' })
  @ApiProperty({
    description: 'The user who received the introduction',
    type: () => User,
  })
  receiverUser!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'tutorUserId' })
  @ApiProperty({
    description: 'The user who tutored the receiver',
    type: () => User,
  })
  tutorUser!: User;

  @OneToMany(() => ResourceIntroductionHistoryItem, (history) => history.introduction)
  @ApiProperty({
    description: 'History of revoke/unrevoke actions for this introduction',
    type: () => [ResourceIntroductionHistoryItem],
  })
  history!: ResourceIntroductionHistoryItem[];

  @ManyToOne(() => ResourceGroup, (group) => group.introductions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceGroupId' })
  resourceGroup!: ResourceGroup;
}
