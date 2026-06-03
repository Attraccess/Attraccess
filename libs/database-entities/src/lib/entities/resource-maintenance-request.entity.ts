import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceMaintenance } from './resource.maintenance';

export enum MaintenanceRequestStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity()
export class ResourceMaintenanceRequest {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the maintenance request',
    example: 1,
  })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the request was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the request was last updated',
  })
  updatedAt!: Date;

  @Column({ type: 'int' })
  @ApiProperty({
    description: 'The ID of the resource the request is for',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  resource!: Resource;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Why the user thinks the resource needs maintenance',
    example: 'The spindle makes a grinding noise and stops mid-cut.',
  })
  reason!: string;

  @Column({
    type: 'simple-enum',
    enum: MaintenanceRequestStatus,
    default: MaintenanceRequestStatus.OPEN,
  })
  @ApiProperty({
    description: 'The current status of the request',
    enum: MaintenanceRequestStatus,
    enumName: 'MaintenanceRequestStatus',
    example: MaintenanceRequestStatus.OPEN,
  })
  status!: MaintenanceRequestStatus;

  @ManyToOne(() => User, { nullable: true })
  @ApiProperty({
    description: 'The user who reported the resource as broken',
    required: false,
  })
  createdByUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @ApiProperty({
    description: 'The maintainer who resolved or dismissed the request',
    required: false,
  })
  resolvedByUser!: User | null;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the request was resolved or dismissed',
    required: false,
    type: String,
    nullable: true,
    format: 'date-time',
  })
  resolvedAt!: Date | null;

  @ManyToOne(() => ResourceMaintenance, { nullable: true })
  @ApiProperty({
    description: 'The maintenance created from this request (null until converted)',
    required: false,
  })
  resultingMaintenance!: ResourceMaintenance | null;
}
