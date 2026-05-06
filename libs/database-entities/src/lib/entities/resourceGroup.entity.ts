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
import { ResourceIntroductionSchedule } from './resource-introduction-schedule.entity';

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

  @OneToMany(() => ResourceIntroductionSchedule, (s) => s.resourceGroup)
  introductionSchedules!: ResourceIntroductionSchedule[];
}
