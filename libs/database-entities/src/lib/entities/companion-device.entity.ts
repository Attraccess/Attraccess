import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Resource } from './resource.entity';

@Entity()
export class CompanionDevice {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the companion device' })
  id!: number;

  @Column({ type: 'text', nullable: false, default: 'Unnamed Device', unique: true })
  @ApiProperty({ description: 'The display name of the companion device' })
  name!: string;

  @Column({ type: 'text', nullable: false })
  @Exclude()
  tokenHash!: string;

  @ManyToMany(() => Resource)
  @JoinTable()
  @ApiProperty({ description: 'Resources this device controls', type: () => Resource, isArray: true })
  resources!: Resource[];

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @ApiProperty({ description: 'Last time this device connected' })
  lastConnection!: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @ApiProperty({ description: 'First time this device connected' })
  firstConnection!: Date;
}
