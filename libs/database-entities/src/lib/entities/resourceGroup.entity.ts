import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroduction } from './resourceIntroduction.entity';
import { ResourceIntroducer } from './resourceIntroducer.entity';
import { Resource } from './resource.entity';

@Entity()
export class ResourceGroup {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource group',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
  })
  name!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  description!: string | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description:
      'Days after a user was trained on this group before retraining is required. Null disables the age-based trigger.',
    example: 365,
    required: false,
    nullable: true,
  })
  retrainingMaxAgeDays!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description:
      'Days a user may go without using a resource in this group before retraining is required. Null disables the inactivity trigger.',
    example: 180,
    required: false,
    nullable: true,
  })
  retrainingMaxInactivityDays!: number | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether to block access to grouped resources once retraining is due until the user is retrained',
    example: false,
    default: false,
  })
  retrainingBlocksAccess!: boolean;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the resource was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the resource was last updated',
  })
  updatedAt!: Date;

  @OneToMany(() => ResourceIntroduction, (introduction) => introduction.resourceGroup)
  introductions!: ResourceIntroduction[];

  @OneToMany(() => ResourceIntroducer, (introducer) => introducer.resourceGroup)
  introducers!: ResourceIntroducer[];

  @ManyToMany(() => Resource, (resource) => resource.groups, { onDelete: 'CASCADE' })
  resources!: Resource[];
}
