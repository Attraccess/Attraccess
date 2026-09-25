import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateNested, IsArray, IsOptional } from 'class-validator';
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

export class DashboardPinOperationDto {
  @ApiProperty({ enum: ['add', 'remove', 'reorder'] })
  @IsIn(['add', 'remove', 'reorder'])
  kind!: 'add' | 'remove' | 'reorder';

  @ApiProperty({ required: false, type: () => DashboardPinDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardPinDto)
  item?: DashboardPinDto;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  order?: string[];
}

export class UpdateDashboardPinsDto {
  @ApiProperty({ type: [DashboardPinDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardPinDto)
  items!: DashboardPinDto[];

  @ApiProperty({ required: false, type: () => DashboardPinOperationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardPinOperationDto)
  operation?: DashboardPinOperationDto;
}
