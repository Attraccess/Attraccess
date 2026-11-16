import { ApiProperty } from '@nestjs/swagger';
import { AnyNotificationCategory, NotificationCategory } from '../notification-types';

export class SystemNotificationLiveEventDto {
  @ApiProperty({
    enum: NotificationCategory,
    enumName: 'NotificationCategory',
    description: 'Core category, or `plugin.<pluginName>.<id>` for plugin-declared categories',
  })
  category!: AnyNotificationCategory;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ required: false, nullable: true })
  url?: string;

  @ApiProperty({ enum: ['info', 'warning'], enumName: 'SystemNotificationSeverity' })
  severity!: 'info' | 'warning';
}
