import { ApiProperty } from '@nestjs/swagger';
import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
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
class MeterSessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() usageId!: number;
  @ApiProperty() meterName!: string;
  @ApiProperty() creditsPerUnit!: number;
  @ApiProperty({ type: String, nullable: true }) latestValue!: string | null;
  @ApiProperty({ type: Number, nullable: true }) chargeCredits!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) latestObservedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) source!: string | null;
}
export class ResourceMeterDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() creditsPerUnit!: number;
  @ApiProperty({ description: 'Total recorded consumption, including outside sessions' }) lifetimeValue!: string;
  @ApiProperty({ type: String, nullable: true }) counterValue!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) latestObservedAt!: Date | null;
  @ApiProperty({ type: MeterSessionDto, nullable: true }) session!: MeterSessionDto | null;
}
class MeterDefinitionDto {
  @ApiProperty() meterId!: number;
  @ApiProperty() name!: string;
  @ApiProperty() creditsPerUnit!: number;
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
