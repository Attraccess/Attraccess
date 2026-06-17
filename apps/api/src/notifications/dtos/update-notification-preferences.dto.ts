import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationCategory } from '../notification-types';

export class UpdateNotificationChannelsDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  toast?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsEnum(NotificationCategory)
  @ApiProperty({ enum: NotificationCategory, enumName: 'NotificationCategory' })
  category!: NotificationCategory;

  @IsObject()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelsDto)
  @ApiProperty({ type: UpdateNotificationChannelsDto })
  channels!: UpdateNotificationChannelsDto;
}
