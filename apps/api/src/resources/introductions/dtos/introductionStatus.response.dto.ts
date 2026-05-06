// Response DTO with full introduction status (active, warning, expired)
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';

export enum IntroductionStatus {
  ACTIVE = 'ACTIVE',
  WARNING = 'WARNING',
  EXPIRED = 'EXPIRED',
}

export class IntroductionScheduleStatusDto {
  @ApiProperty() scheduleId!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: string | null;
  @ApiProperty() isWarning!: boolean;
  @ApiProperty() isDue!: boolean;
  @ApiProperty() blockAccess!: boolean;
}

export class IntroductionStatusResponseDto {
  @ApiProperty() hasValidIntroduction!: boolean;
  @ApiProperty({ enum: IntroductionStatus, enumName: 'IntroductionStatus' }) status!: IntroductionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: string | null;
  @ApiProperty({ type: [IntroductionScheduleStatusDto] }) schedules!: IntroductionScheduleStatusDto[];
}
