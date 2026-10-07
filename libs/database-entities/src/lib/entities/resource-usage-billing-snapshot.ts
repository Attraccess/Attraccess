import { ApiProperty } from '@nestjs/swagger';
import { Column } from 'typeorm';

/** Persisted resource usage billing snapshot inherited by ResourceUsage. */
export abstract class ResourceUsageBillingSnapshot {
  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'Snapshot of the session-duration rate when this usage session started',
    required: false,
    nullable: true,
  })
  sessionDurationCreditsPerMinute!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'Snapshot of the attributable-operating-duration rate when this usage session started',
    required: false,
    nullable: true,
  })
  operatingDurationCreditsPerMinute!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'Fixed usage fee snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
  })
  creditsPerUsage!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'User billing percentage snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
  })
  billingFactor!: number | null;

  @Column({ type: 'simple-json', nullable: true })
  @ApiProperty({
    type: [Object],
    nullable: true,
    required: false,
  })
  meterRates!: { meterId: number; name: string; creditsPerUnit: number }[] | null;

  @Column({ type: 'float', nullable: true })
  @ApiProperty({
    description: 'Operating duration attributed to this usage session in minutes',
    required: false,
    nullable: true,
  })
  attributedOperatingDurationInMinutes!: number | null;
}
