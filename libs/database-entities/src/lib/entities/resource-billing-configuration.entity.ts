import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { Expose } from 'class-transformer';

@Entity()
export class ResourceBillingConfiguration {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource billing configuration',
    example: 1,
  })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @Column({ type: 'integer', unique: true })
  @ApiProperty({ description: 'The ID of the resource' })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.billingConfigurations)
  @ApiProperty({ description: 'The resource', required: false })
  resource!: Resource;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The credit cost per usage' })
  creditsPerUsage!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The credit cost per minute' })
  creditsPerMinute!: number;

  @Expose()
  @ApiProperty({ description: 'Whether billing is enabled' })
  public get isBillingEnabled(): boolean {
    return this.creditsPerUsage > 0 || this.creditsPerMinute > 0;
  }
}
