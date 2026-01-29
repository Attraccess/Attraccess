import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
@Index(['beaconIdentifier', 'observedAt'])
export class BeaconPosition {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the position record' })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'Beacon identifier' })
  beaconIdentifier!: string;

  @Column({ type: 'real' })
  @ApiProperty({ description: 'Estimated X coordinate (meters)' })
  x!: number;

  @Column({ type: 'real' })
  @ApiProperty({ description: 'Estimated Y coordinate (meters)' })
  y!: number;

  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Trilateration residual/error', required: false })
  residual!: number | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  @ApiProperty({ description: 'When the position was observed' })
  observedAt!: Date;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the record was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the record was last updated' })
  updatedAt!: Date;
}
