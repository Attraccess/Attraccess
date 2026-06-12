import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferenceDto {
  @ApiProperty({
    description: 'Whether to send an email when a direct message arrives while the user is offline',
    example: true,
  })
  messagesEmailOnOffline!: boolean;

  @ApiProperty({
    description: 'Whether to send a browser push notification when a direct message arrives while the user is offline',
    example: true,
  })
  messagesPushEnabled!: boolean;
}
