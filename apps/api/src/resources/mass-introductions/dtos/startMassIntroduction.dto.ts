import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 * Opens a mass-introduction session. Exactly one of resourceId and resourceGroupId selects what
 * participants are introduced to.
 */
export class StartMassIntroductionDto {
  @ApiPropertyOptional({ description: 'The resource to introduce participants to', example: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  resourceId?: number;

  @ApiPropertyOptional({ description: 'The resource group to introduce participants to', example: 2 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  resourceGroupId?: number;

  @ApiPropertyOptional({
    description: 'An Attractap reader that shows a scan screen so participants can also tap their NFC card',
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  readerId?: number;
}
