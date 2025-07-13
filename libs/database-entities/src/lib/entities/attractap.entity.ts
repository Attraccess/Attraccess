import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Resource } from './resource.entity';

@Entity()
export class Attractap {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the reader' })
  id!: number;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The name of the reader' })
  name!: string;

  @Column({
    type: 'text',
    nullable: false,
  })
  @Exclude()
  apiTokenHash!: string;

  @ManyToMany(() => Resource, (resource) => resource.attractapReaders)
  @JoinTable()
  @ApiProperty({ description: 'The resources that the reader has access to', type: () => Resource, isArray: true })
  resources!: Resource[];

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @ApiProperty({ description: 'The last time the reader connected to the server' })
  lastConnection!: Date;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @ApiProperty({ description: 'The first time the reader connected to the server' })
  firstConnection!: Date;

  @ApiProperty({ description: 'Whether the reader is currently connected' })
  connected?: boolean;
}
