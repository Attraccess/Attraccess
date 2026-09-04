import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDate, IsInt, Min } from 'class-validator';

export const MAX_RESOURCE_IDS_PER_REPORT = 100;

export class ResourceOperatingDurationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_RESOURCE_IDS_PER_REPORT)
  @IsInt({ each: true })
  @Min(1, { each: true })
  resourceIds!: number[];

  @Type(() => Date)
  @IsDate()
  start!: Date;

  @Type(() => Date)
  @IsDate()
  end!: Date;
}
