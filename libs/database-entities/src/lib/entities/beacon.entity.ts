import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { IsEnum } from 'class-validator';

export enum BeaconType {
  HOLYIOT = 'holyiot',
}

@Entity()
export class Beacon {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({ description: 'Beacon identifier (primary key)' })
  identifier!: string;

  @Column({ type: 'simple-enum', enum: BeaconType })
  @ApiProperty({ description: 'Beacon type', enum: BeaconType, enumName: 'BeaconType' })
  @IsEnum(BeaconType)
  type!: BeaconType;

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
