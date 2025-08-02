import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

@Entity()
export class ResourceMaintenance {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the maintenance',
    example: 1,
  })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the maintenance was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the maintenance was last updated',
  })
  updatedAt!: Date;

  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.maintenances)
  resource!: Resource;

  @Column({ type: 'datetime' })
  @ApiProperty({
    description: 'When the maintenance started',
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  startTime!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the maintenance ended (null if not ended yet)',
    required: false,
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    nullable: true,
    format: 'date-time',
  })
  endTime!: Date | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The reason for the maintenance',
    required: false,
  })
  reason!: string | null;
}
