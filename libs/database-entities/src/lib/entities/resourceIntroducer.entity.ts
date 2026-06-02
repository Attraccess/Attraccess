import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceGroup } from './resourceGroup.entity';

export enum ResourceIntroducerType {
  INTRODUCER = 'introducer',
  MAINTAINER = 'maintainer',
}

@Entity()
export class ResourceIntroducer {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the introduction permission',
    example: 1,
  })
  id!: number;

  @Column({
    type: 'simple-enum',
    enum: ResourceIntroducerType,
    default: ResourceIntroducerType.INTRODUCER,
  })
  @ApiProperty({
    description:
      "The kind of access: 'introducer' can give introductions and do maintenance; 'maintainer' can only do maintenance and control the machine",
    enum: ResourceIntroducerType,
    example: ResourceIntroducerType.INTRODUCER,
    enumName: 'ResourceIntroducerType',
  })
  type!: ResourceIntroducerType;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The ID of the resource (if permission is for a specific resource)',
    example: 1,
    required: false,
  })
  resourceId!: number | null;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user who can give introductions',
    example: 1,
  })
  userId!: number;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The ID of the resource group (if permission is for a group)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the permission was granted',
  })
  grantedAt!: Date;

  @ManyToOne(() => Resource, undefined, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  @ApiProperty({
    description: 'The user who can give introductions',
    type: () => User,
  })
  user!: User;

  @ManyToOne(() => ResourceGroup, undefined, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceGroupId' })
  resourceGroup!: ResourceGroup | null;
}
