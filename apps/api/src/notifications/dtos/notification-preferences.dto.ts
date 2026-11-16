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

export class PluginNotificationLabelDto {
  @ApiProperty()
  en!: string;

  @ApiProperty()
  de!: string;
}

export class PluginNotificationCategoryPreferenceDto {
  @ApiProperty({ description: 'Namespaced key `plugin.<pluginName>.<id>`; pass it as category when updating' })
  category!: string;

  @ApiProperty()
  pluginName!: string;

  @ApiProperty({ type: PluginNotificationLabelDto })
  label!: PluginNotificationLabelDto;

  @ApiProperty({ type: NotificationChannelsDto })
  channels!: NotificationChannelsDto;
}

export class NotificationPreferencesDto {
  @ApiProperty({ type: [NotificationCategoryPreferenceDto] })
  categories!: NotificationCategoryPreferenceDto[];

  @ApiProperty({
    type: [PluginNotificationCategoryPreferenceDto],
    description: 'Categories declared by plugins, to be shown grouped under the plugin name',
  })
  pluginCategories!: PluginNotificationCategoryPreferenceDto[];
}
