import { ApiProperty } from '@nestjs/swagger';
import { NotificationCategory } from '../notification-types';

export class NotificationChannelsDto {
  @ApiProperty({ example: true })
  email!: boolean;

  @ApiProperty({ example: true })
  push!: boolean;

  @ApiProperty({ example: true })
  toast!: boolean;
}

export class NotificationCategoryPreferenceDto {
  @ApiProperty({ enum: NotificationCategory, enumName: 'NotificationCategory' })
  category!: NotificationCategory;

  @ApiProperty({ type: NotificationChannelsDto })
  channels!: NotificationChannelsDto;
}

export class NotificationPreferencesDto {
  @ApiProperty({ type: [NotificationCategoryPreferenceDto] })
  categories!: NotificationCategoryPreferenceDto[];
}
