import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, IsObject, IsOptional, ValidateNested } from 'class-validator';
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
  @IsString()
  @ApiProperty({
    description: 'A core NotificationCategory value, or the `plugin.<pluginName>.<id>` key of a plugin category',
    example: NotificationCategory.MESSAGES,
  })
  category!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelsDto)
  @ApiProperty({ type: UpdateNotificationChannelsDto })
  channels!: UpdateNotificationChannelsDto;
}
