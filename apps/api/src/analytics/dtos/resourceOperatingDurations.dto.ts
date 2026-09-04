import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDate, IsInt, Min } from 'class-validator';

export class ResourceOperatingDurationsDto {
  @IsArray()
  @ArrayNotEmpty()
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
