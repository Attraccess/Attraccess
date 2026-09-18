import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatingOpenIntervalDto {
  @ApiProperty({ description: 'The unique identifier of the open operating interval', example: 1 })
  id!: number;

  @ApiProperty({ description: 'UTC instant at which the current operating stretch began', format: 'date-time' })
  startTime!: Date;
}

export class OperatingStateDto {
  @ApiProperty({ description: 'Current operating state of the resource', enum: ['operating', 'idle'] })
  state!: 'operating' | 'idle';

  @ApiPropertyOptional({
    description: 'The open interval backing an operating state; null while idle',
    type: OperatingOpenIntervalDto,
    nullable: true,
  })
  openInterval!: OperatingOpenIntervalDto | null;

  @ApiPropertyOptional({
    description: 'Timestamp of the most recent transition on the timeline, if any',
    format: 'date-time',
    nullable: true,
  })
  lastTransitionAt!: Date | null;
}

export class OperatingTransitionDto {
  @ApiProperty({ description: 'UTC instant of the transition', format: 'date-time' })
  timestamp!: Date;

  @ApiProperty({ description: 'State the resource transitioned into', enum: ['operating', 'idle'] })
  state!: 'operating' | 'idle';

  @ApiProperty({ description: 'Authoritative interval row the transition is derived from', example: 1 })
  intervalId!: number;

  @ApiProperty({
    description: 'Origin of the transition record; the timeline is written exclusively by flow signals',
    example: 'flow-signal',
  })
  source!: string;
}

export class OperatingTransitionPageDto {
  @ApiProperty({ description: 'Derived transitions, newest first', type: [OperatingTransitionDto] })
  items!: OperatingTransitionDto[];

  @ApiProperty({ description: 'Total number of authoritative interval rows for the resource', example: 42 })
  totalIntervals!: number;

  @ApiProperty({ description: 'The page number of interval rows this response was derived from', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Interval rows per page', example: 20 })
  limit!: number;
}

export class OperatingUnattributedSummaryDto {
  @ApiProperty({ description: 'Snapshot time the summary was derived at', format: 'date-time' })
  asOf!: Date;

  @ApiProperty({ description: 'Start of the summarized range', format: 'date-time' })
  windowStart!: Date;

  @ApiProperty({ description: 'Total operating duration in the range, in ms' })
  operatingDurationMs!: number;

  @ApiProperty({ description: 'Operating duration attributed to usage sessions, in ms' })
  attributedOperatingDurationMs!: number;

  @ApiProperty({ description: 'Operating duration not attributed to any usage session, in ms' })
  unattributedOperatingDurationMs!: number;

  @ApiProperty({ description: 'True while open intervals or sessions make the summary provisional' })
  isProvisional!: boolean;

  @ApiProperty({ description: 'Number of attribution intersections behind the summary', example: 3 })
  attributionCount!: number;
}

export class OperatingDataQualityIssueDto {
  @ApiProperty({
    description: 'Stable identifier of the data-quality check that failed',
    example: 'overlapping-intervals',
  })
  kind!: string;

  @ApiProperty({ description: 'Number of offending rows found in the scanned window', example: 2 })
  count!: number;

  @ApiProperty({ description: 'Human-readable explanation of the finding', example: 'Intervals overlap in time' })
  message!: string;

  @ApiProperty({ description: 'Sample of affected interval ids (up to 10)', type: [Number] })
  intervalIds!: number[];
}

export class OperatingDataQualityReportDto {
  @ApiProperty({ description: 'Start of the scanned window', format: 'date-time' })
  from!: Date;

  @ApiProperty({ description: 'End of the scanned window', format: 'date-time' })
  to!: Date;

  @ApiProperty({ description: 'Whether the resource has operating/idle flow nodes configured' })
  trackingConfigured!: boolean;

  @ApiProperty({ description: 'Data-quality failures found; empty when the timeline is clean', type: [OperatingDataQualityIssueDto] })
  issues!: OperatingDataQualityIssueDto[];
}

export class OperatingTimelineVerificationCheckDto {
  @ApiProperty({ description: 'Name of the verification check', example: 'operating-duration-matches' })
  name!: string;

  @ApiProperty({ description: 'Whether the check passed' })
  passed!: boolean;

  @ApiPropertyOptional({ description: 'Detail for a failing check', nullable: true })
  detail?: string | null;
}

export class OperatingTimelineVerificationDto {
  @ApiProperty({ description: 'The verified resource', example: 1 })
  resourceId!: number;

  @ApiProperty({ description: 'Start of the verified range', format: 'date-time' })
  from!: Date;

  @ApiProperty({ description: 'End of the verified range', format: 'date-time' })
  to!: Date;

  @ApiProperty({ description: 'True when every check passed' })
  consistent!: boolean;

  @ApiProperty({ description: 'Operating duration recomputed directly from authoritative interval rows, in ms' })
  recomputedOperatingDurationMs!: number;

  @ApiProperty({ description: 'Operating duration reported by the derived attribution view, in ms' })
  reportedOperatingDurationMs!: number;

  @ApiProperty({ description: 'Attributed operating duration reported by the derived view, in ms' })
  reportedAttributedDurationMs!: number;

  @ApiProperty({ description: 'Unattributed operating duration reported by the derived view, in ms' })
  reportedUnattributedDurationMs!: number;

  @ApiProperty({ description: 'Number of authoritative interval rows overlapping the range', example: 7 })
  intervalCount!: number;

  @ApiProperty({
    description:
      'Whether persisted aggregate tables were included in the verification. False while all views are derived directly from the timeline (ATT-1024).',
  })
  aggregatesPresent!: boolean;

  @ApiProperty({ description: 'Explanation of what was verified' })
  note!: string;

  @ApiProperty({ description: 'Individual verification checks', type: [OperatingTimelineVerificationCheckDto] })
  checks!: OperatingTimelineVerificationCheckDto[];
}
