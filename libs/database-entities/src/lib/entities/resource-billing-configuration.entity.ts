import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { ProjectSwitchCharging } from '@attraccess/application-models';

@Entity()
export class ResourceBillingConfiguration {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource billing configuration',
    example: 1,
  })
  id!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @Column({ type: 'integer', unique: true })
  @ApiProperty({ description: 'The ID of the resource' })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.billingConfigurations)
  @ApiProperty({ description: 'The resource', required: false })
  resource!: Resource;

  @Column({ type: 'bigint' })
  @ApiProperty({ description: 'The credit cost per usage' })
  creditsPerUsage!: number;

  @Column({ type: 'bigint' })
  @ApiProperty({ description: 'The credit cost per minute' })
  creditsPerMinute!: number;

  @Column({ type: 'bigint', default: 0 })
  @ApiProperty({ description: 'The credit cost per attributable operating minute' })
  creditsPerOperatingMinute!: number;

  @Column({ type: 'varchar', default: ProjectSwitchCharging.CONTINUE })
  @ApiProperty({
    description: 'How a running session is charged when its owner switches its project',
    enum: ProjectSwitchCharging,
    enumName: 'ProjectSwitchCharging',
  })
  projectSwitchCharging!: ProjectSwitchCharging;
}
