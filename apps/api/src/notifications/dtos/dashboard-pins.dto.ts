import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardPinDto {
  @ApiProperty({ enum: ['page', 'resource'] })
  @IsIn(['page', 'resource'])
  itemType!: 'page' | 'resource';

  @ApiProperty({ description: 'A route path for page pins or a resource id for resource pins' })
  @IsString()
  @IsNotEmpty()
  itemId!: string;
}

export class UpdateDashboardPinsDto {
  @ApiProperty({ type: [DashboardPinDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardPinDto)
  items!: DashboardPinDto[];
}
