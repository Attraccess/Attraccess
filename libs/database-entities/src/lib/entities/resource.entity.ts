import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroduction } from './resourceIntroduction.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { ResourceIntroducer } from './resourceIntroducer.entity';
import { ResourceGroup } from './resourceGroup.entity';
import { DocumentationType } from '../types/documentationType.enum';
import { ResourceFlowNode } from './resourceFlowNode';
import { ResourceFlowEdge } from './resourceFlowEdge';
import { ResourceFlowLog } from './resourceFlowLog';
import { Attractap } from './attractap.entity';
import { ResourceMaintenance } from './resource.maintenance';
import { ResourceType } from './resource.type';

@Entity()
export class Resource {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
  })
  name!: string;

  @Column({ type: 'simple-enum', enum: ResourceType })
  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
  })
  type!: ResourceType;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
  })
  separateUnlockAndUnlatch!: boolean | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The filename of the resource image',
    example: '1234567890_abcdef.jpg',
    required: false,
  })
  imageFilename!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
  })
  documentationType!: DocumentationType | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Markdown content for resource documentation',
    required: false,
    example: '# Resource Documentation\n\nThis is a markdown documentation for the resource.',
  })
  documentationMarkdown!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'URL to external documentation',
    required: false,
    example: 'https://example.com/documentation',
  })
  documentationUrl!: string | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    example: false,
    default: false,
  })
  allowTakeOver!: boolean;

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

  @OneToMany(() => ResourceIntroduction, (introduction) => introduction.resource)
  introductions!: ResourceIntroduction[];

  @OneToMany(() => ResourceUsage, (usage) => usage.resource)
  usages!: ResourceUsage[];

  @OneToMany(() => ResourceFlowNode, (node) => node.resource)
  flowNodes!: ResourceFlowNode[];

  @OneToMany(() => ResourceFlowEdge, (edge) => edge.resource)
  flowEdges!: ResourceFlowEdge[];

  @OneToMany(() => ResourceFlowLog, (log) => log.resource)
  flowLogs!: ResourceFlowLog[];

  @OneToMany(() => ResourceIntroducer, (introducer) => introducer.resource)
  introducers!: ResourceIntroducer[];

  @ManyToMany(() => ResourceGroup, (group) => group.resources)
  @JoinTable()
  @ApiProperty({
    description: 'The groups the resource belongs to',
    type: ResourceGroup,
    isArray: true,
  })
  groups!: ResourceGroup[];

  @ManyToMany(() => Attractap, (reader) => reader.resources)
  attractapReaders!: Attractap[];

  @OneToMany(() => ResourceMaintenance, (maintenance) => maintenance.resource)
  maintenances!: ResourceMaintenance[];
}
