import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Resource } from './resource.entity';

class AttractapCapabilities {
  @Column({
    type: 'boolean',
    nullable: false,
    default: true,
  })
  @ApiProperty({
    description: 'Whether the reader can choose from many linked resources or can only handle one',
    example: true,
    default: true,
  })
  resourceSelection!: boolean;

  @Column({
    type: 'boolean',
    nullable: false,
    default: false,
  })
  @ApiProperty({
    description:
      'Whether the reader has interface options for triggering resource actions, if not a actions is triggered immediately upon scanning a nfc card',
    example: true,
    default: true,
  })
  resourceActionSelection!: boolean;

  @Column({
    type: 'boolean',
    nullable: false,
    default: true,
  })
  @ApiProperty({
    description: 'Whether the reader can enroll new cards',
    example: true,
    default: true,
  })
  cardEnrollment!: boolean;

  @Column({
    type: 'boolean',
    nullable: false,
    default: false,
  })
  @ApiProperty({
    description: 'Whether the reader has addressable LEDs',
    example: false,
    default: false,
  })
  hasLeds!: boolean;
}

export class AttractapFirmwareVersion {
  @Column({
    type: 'text',
    nullable: true,
  })
  @ApiProperty({ description: 'The name of the firmware', example: 'Attractap', nullable: true })
  name!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  @ApiProperty({ description: 'The variant of the firmware', example: 'eth', nullable: true })
  variant!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  @ApiProperty({ description: 'The version of the firmware', example: '1.0.0', nullable: true })
  version!: string | null;

  @Column(() => AttractapCapabilities, { prefix: 'capabilities' })
  @ApiProperty({ description: 'The capabilities of the reader', type: () => AttractapCapabilities })
  capabilities!: AttractapCapabilities;
}

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

  @Column({
    type: 'integer',
    nullable: false,
    default: 255,
  })
  @ApiProperty({
    description: 'Global LED brightness for the reader (0-255)',
    example: 255,
    default: 255,
    minimum: 0,
    maximum: 255,
  })
  ledBrightness!: number;

  @Column(() => AttractapFirmwareVersion, { prefix: 'firmware' })
  @ApiProperty({ description: 'The firmware of the reader', type: () => AttractapFirmwareVersion })
  firmware!: AttractapFirmwareVersion;
}
