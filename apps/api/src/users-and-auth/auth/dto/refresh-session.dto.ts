import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class RefreshSessionDto {
  @ApiPropertyOptional({ enum: ['cookie', 'body'], default: 'cookie' })
  @IsOptional()
  @IsIn(['cookie', 'body'])
  tokenLocation?: 'cookie' | 'body';
}
