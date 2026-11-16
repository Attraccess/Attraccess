import { ApiProperty } from '@nestjs/swagger';
import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class MeterNameDto {
  @ApiProperty({ description: 'The name of the meter', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
export class MeterRateDto {
  @ApiProperty({ description: 'Minor currency units per measured value. 0 disables billing.' })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  creditsPerUnit!: number;
}
export const METER_ALLOCATIONS = ['shared', 'per-session'] as const;
export type MeterAllocation = (typeof METER_ALLOCATIONS)[number];

export class MeterAllocationDto {
  @ApiProperty({
    enum: METER_ALLOCATIONS,
    enumName: 'ResourceMeterAllocation',
    description:
      '`shared`: every start and stop opens a time segment whose consumption is split equally between the sessions in it. `per-session`: a flow measures every session separately.',
  })
  @IsIn(METER_ALLOCATIONS)
  allocation!: MeterAllocation;
}

export class MeterShareSegmentDto {
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) endedAt!: string;
  @ApiProperty({ description: 'How many sessions were active in the segment' }) participants!: number;
  @ApiProperty({ description: 'Everything the meter counted in the segment' }) totalQuantity!: string;
  @ApiProperty({ description: 'The credits of the whole segment' }) totalCredits!: number;
  @ApiProperty({ description: "This session's share of the quantity" }) shareQuantity!: string;
  @ApiProperty({ description: 'The whole credits charged to this session for the segment' }) shareCredits!: number;
}

class MeterSessionDto {
  @ApiProperty({ type: String, nullable: true, description: 'Null when meter initialization was skipped' })
  sessionId!: string | null;
  @ApiProperty() usageId!: number;
  @ApiProperty() meterName!: string;
  @ApiProperty() creditsPerUnit!: number;
  @ApiProperty({ type: String, nullable: true }) latestValue!: string | null;
  @ApiProperty({ type: Number, nullable: true }) chargeCredits!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) latestObservedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) source!: string | null;
  @ApiProperty({ required: false, description: 'The session shares this meter with others: the values are its share' })
  shared?: boolean;
  @ApiProperty({ required: false, description: 'The share includes the open segment, which changes until the next reading' })
  provisional?: boolean;
  @ApiProperty({ type: Number, nullable: true, required: false, description: 'Sessions in the open segment' })
  participants?: number | null;
  @ApiProperty({
    type: [MeterShareSegmentDto],
    required: false,
    description: 'The segments the session took part in so far, for a session that shares the meter',
  })
  segments?: MeterShareSegmentDto[];
}
export class ResourceMeterDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() creditsPerUnit!: number;
  @ApiProperty({ enum: METER_ALLOCATIONS, enumName: 'ResourceMeterAllocation' }) allocation!: MeterAllocation;
  @ApiProperty({ description: 'Total recorded consumption, including outside sessions' }) lifetimeValue!: string;
  @ApiProperty({ type: String, nullable: true }) counterValue!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) latestObservedAt!: Date | null;
  @ApiProperty({ type: MeterSessionDto, nullable: true, description: 'The earliest running session' })
  session!: MeterSessionDto | null;
  @ApiProperty({ type: [MeterSessionDto], description: 'Every running session of the machine for this meter' })
  sessions!: MeterSessionDto[];
}
class MeterDefinitionDto {
  @ApiProperty() meterId!: number;
  @ApiProperty() name!: string;
  @ApiProperty() creditsPerUnit!: number;
  @ApiProperty({ enum: METER_ALLOCATIONS, enumName: 'ResourceMeterAllocation' }) allocation!: MeterAllocation;
  @ApiProperty() configured!: boolean;
  @ApiProperty({ type: [String] }) problems!: string[];
  @ApiProperty() interimIntervalMinutes!: number;
}
class ResourceMeteringUnsettledSessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() usageId!: number;
  @ApiProperty() meterId!: number;
  @ApiProperty() meterName!: string;
  @ApiProperty({ enum: ResourceMeteringSessionStatus, enumName: 'ResourceMeteringSessionStatus' })
  status!: ResourceMeteringSessionStatus;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) latestValue!: string | null;
  @ApiProperty() retryable!: boolean;
}
export class ResourceMeteringStatusDto {
  @ApiProperty({ type: [MeterDefinitionDto] }) meters!: MeterDefinitionDto[];
  @ApiProperty({ type: [ResourceMeteringUnsettledSessionDto] }) unsettled!: ResourceMeteringUnsettledSessionDto[];
}
export class ResourceMeteringSettlementDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ enum: ResourceMeteringSessionStatus, enumName: 'ResourceMeteringSessionStatus' })
  status!: ResourceMeteringSessionStatus;
  @ApiProperty({ type: Number, nullable: true }) chargeCredits!: number | null;
}
export class ResourceMeteringLiveDto {
  @ApiProperty({ type: [ResourceMeterDto] }) meters!: ResourceMeterDto[];
}
