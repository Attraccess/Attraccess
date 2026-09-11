import { IsDateString, IsOptional } from 'class-validator';

export class ResourceOperatingAttributionQueryDto {
  @IsOptional()
  @IsDateString()
  start?: string;

  @IsOptional()
  @IsDateString()
  end?: string;
}
