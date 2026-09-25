import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateNested, IsOptional } from 'class-validator';
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
  @ApiProperty({ enum: ['add', 'remove', 'move'] })
  @IsIn(['add', 'remove', 'move'])
  kind!: 'add' | 'remove' | 'move';

  @ApiProperty({ type: DashboardPinDto })
  @ValidateNested()
  @Type(() => DashboardPinDto)
  item!: DashboardPinDto;

  @ApiProperty({ required: false, type: DashboardPinDto, description: 'Move the item before this pin, or to the end when omitted' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardPinDto)
  before?: DashboardPinDto;
}
