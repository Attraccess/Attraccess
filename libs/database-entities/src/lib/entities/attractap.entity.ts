import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

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

  @Column({
    type: 'simple-array',
    default: '',
  })
  @ApiProperty({
    description: 'The IDs of the resources that the reader has access to',
    type: [Number],
  })
  hasAccessToResourceIds!: number[];

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
