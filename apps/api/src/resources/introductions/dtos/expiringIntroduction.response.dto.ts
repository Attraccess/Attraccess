// Self-service list of introductions that are warning/expired
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IntroductionStatus } from './introductionStatus.response.dto';

export class ExpiringIntroductionDto {
  @ApiProperty({ enum: ['resource', 'resourceGroup'] }) kind!: 'resource' | 'resourceGroup';
  @ApiProperty({ required: false }) resourceId?: number;
  @ApiProperty({ required: false }) resourceGroupId?: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: IntroductionStatus, enumName: 'IntroductionStatus' }) status!: IntroductionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: string | null;
}
