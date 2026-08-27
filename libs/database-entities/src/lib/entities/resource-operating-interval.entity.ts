import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

@Index('IDX_resource_operating_interval_resourceId_endTime', ['resourceId', 'endTime'])
@Entity()
export class ResourceOperatingInterval {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the operating interval', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The resource being operated', example: 1 })
  resourceId!: number;

  @Column({ type: 'datetime' })
  @ApiProperty({ description: 'UTC instant at which operation began', format: 'date-time' })
  startTime!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({ description: 'UTC instant at which operation ended', format: 'date-time', nullable: true })
  endTime!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Resource, (resource) => resource.operatingIntervals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;
}
