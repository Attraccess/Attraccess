// DTO for the renew introduction endpoint
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RenewIntroductionRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
