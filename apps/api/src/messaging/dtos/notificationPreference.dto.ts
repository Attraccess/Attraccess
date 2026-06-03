import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferenceDto {
  @ApiProperty({
    description: 'Whether to send an email when a direct message arrives while the user is offline',
    example: true,
  })
  messagesEmailOnOffline!: boolean;
}
