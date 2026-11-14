import { ApiProperty } from '@nestjs/swagger';

class ProjectUsageSummaryDto {
  @ApiProperty({ description: 'Total completed usage sessions in the range' })
  totalSessions!: number;

  @ApiProperty({
    description: 'Person minutes: the duration of every session added up, so parallel sessions count each',
  })
  totalMinutes!: number;

  @ApiProperty({
    description:
      'Machine minutes: time in which at least one of the project sessions was running on a resource. Parallel sessions on one resource count once.',
  })
  totalMachineMinutes!: number;

  @ApiProperty({ description: 'Total credits spent (positive value using currency minor unit)' })
  totalSpend!: number;

  @ApiProperty({ description: 'Currency of the spend totals', example: 'EUR' })
  currency!: string;

  @ApiProperty({ description: 'Minor unit exponent for the currency', example: 2 })
  minorUnit!: number;
}

class ProjectUsageTimeSeriesPointDto {
  @ApiProperty({ description: 'ISO date (yyyy-MM-dd)' })
  date!: string;

  @ApiProperty({ description: 'Number of sessions that started on this day' })
  sessions!: number;

  @ApiProperty({ description: 'Person minutes of the sessions that started on this day' })
  minutes!: number;

  @ApiProperty({
    description:
      'Machine minutes of the runs that started on this day (overlapping sessions are merged and counted on the day of the earliest one)',
  })
  machineMinutes!: number;

  @ApiProperty({ description: 'Total spend (credits) on this day' })
  spend!: number;
}

class ProjectUsageTopResourceDto {
  @ApiProperty()
  resourceId!: number;

  @ApiProperty()
  resourceName!: string;

  @ApiProperty()
  sessions!: number;

  @ApiProperty({ description: 'Person minutes on this resource' })
  minutes!: number;

  @ApiProperty({ description: 'Machine minutes on this resource (overlapping sessions count once)' })
  machineMinutes!: number;

  @ApiProperty()
  spend!: number;
}

export class ProjectUsageStatsDto {
  @ApiProperty({ type: () => ProjectUsageSummaryDto })
  summary!: ProjectUsageSummaryDto;

  @ApiProperty({ type: () => ProjectUsageTimeSeriesPointDto, isArray: true })
  timeSeries!: ProjectUsageTimeSeriesPointDto[];

  @ApiProperty({ type: () => ProjectUsageTopResourceDto, isArray: true })
  topResources!: ProjectUsageTopResourceDto[];
}
