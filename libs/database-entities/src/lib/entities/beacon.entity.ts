import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { IsEnum } from 'class-validator';
import { BleGateway } from './bleGateway.entity';

export enum BeaconType {
  EDDYSTONE = 'eddystone',
}

@Entity()
@Index(['type', 'identifier', 'gatewayId'], { unique: true })
export class Beacon {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the beacon' })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'Beacon identifier' })
  identifier!: string;

  @Column({ type: 'simple-enum', enum: BeaconType })
  @ApiProperty({ description: 'Beacon type', enum: BeaconType, enumName: 'BeaconType' })
  @IsEnum(BeaconType)
  type!: BeaconType;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'Gateway ID' })
  gatewayId!: number;

  @ManyToOne(() => BleGateway, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gatewayId' })
  @ApiProperty({ description: 'Gateway for this beacon', type: () => BleGateway })
  gateway?: BleGateway;

  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Distance to gateway (RSSI value)', required: false })
  distanceToGateway!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Battery level/voltage', required: false })
  battery!: number | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @ApiProperty({ description: 'The last time this beacon was seen' })
  lastSeenAt!: Date;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the beacon was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the beacon was last updated' })
  updatedAt!: Date;
}
