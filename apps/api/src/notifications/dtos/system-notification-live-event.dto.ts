import { ApiProperty } from '@nestjs/swagger';
import { NotificationCategory } from '../notification-types';

export class SystemNotificationLiveEventDto {
  @ApiProperty({ enum: NotificationCategory, enumName: 'NotificationCategory' })
  category!: NotificationCategory;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ required: false, nullable: true })
  url?: string;

  @ApiProperty({ enum: ['info', 'warning'], enumName: 'SystemNotificationSeverity' })
  severity!: 'info' | 'warning';
}
