import { ApiProperty } from '@nestjs/swagger';

class ProjectUsageSummaryDto {
  @ApiProperty({ description: 'Total completed usage sessions in the range' })
  totalSessions!: number;

  @ApiProperty({ description: 'Total minutes spent across sessions (rounded up per session)' })
  totalMinutes!: number;

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

  @ApiProperty({ description: 'Total minutes of the sessions on this day' })
  minutes!: number;

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

  @ApiProperty()
  minutes!: number;

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
