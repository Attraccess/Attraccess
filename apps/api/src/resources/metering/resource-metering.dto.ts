import { ApiProperty } from '@nestjs/swagger';
import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';

class ResourceMeteringActiveSessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() usageId!: number;
  @ApiProperty({ nullable: true, type: String, description: 'Latest accepted total since the metering start, in kWh' })
  latestKwh!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) latestObservedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) source!: string | null;
}

class ResourceMeteringUnsettledSessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() usageId!: number;
  @ApiProperty({ enum: ResourceMeteringSessionStatus, enumName: 'ResourceMeteringSessionStatus' })
  status!: ResourceMeteringSessionStatus;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Last accepted total in kWh, informational only' })
  latestKwh!: string | null;
  @ApiProperty({ description: 'Whether collecting the final total again can still settle the energy charge' })
  retryable!: boolean;
}

export class ResourceMeteringStatusDto {
  @ApiProperty({ description: 'Whether the metering start and collection branches are complete' })
  configured!: boolean;
  @ApiProperty({
    type: [String],
    enum: ['start-trigger-missing', 'ready-unreachable', 'collect-trigger-missing', 'report-unreachable'],
    description: 'What is missing from the meter definition',
  })
  problems!: string[];
  @ApiProperty({ description: 'Minutes between interim readings; 0 when disabled' }) interimIntervalMinutes!: number;
  @ApiProperty({ nullable: true, type: ResourceMeteringActiveSessionDto })
  activeSession!: ResourceMeteringActiveSessionDto | null;
  @ApiProperty({ type: [ResourceMeteringUnsettledSessionDto] }) unsettled!: ResourceMeteringUnsettledSessionDto[];
}

export class ResourceMeteringSettlementDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ enum: ResourceMeteringSessionStatus, enumName: 'ResourceMeteringSessionStatus' })
  status!: ResourceMeteringSessionStatus;
  @ApiProperty({ nullable: true, type: Number }) chargeCredits!: number | null;
}

class ResourceMeteringLiveSessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() usageId!: number;
  @ApiProperty({ description: 'Energy rate captured for this session, in minor currency units per kWh' })
  creditsPerKwh!: number;
  @ApiProperty({ nullable: true, type: String, description: 'Latest accepted total since the metering start, in kWh' })
  latestKwh!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Energy cost so far in minor currency units, rounded like the final charge',
  })
  energyCredits!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) latestObservedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) source!: string | null;
}

export class ResourceMeteringLiveDto {
  @ApiProperty({
    nullable: true,
    type: ResourceMeteringLiveSessionDto,
    description: 'Null when no metered session is running',
  })
  session!: ResourceMeteringLiveSessionDto | null;
}
