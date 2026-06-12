import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether to send an email when a direct message arrives while the user is offline',
    example: true,
    required: false,
  })
  messagesEmailOnOffline?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether to send a browser push notification when a direct message arrives while the user is offline',
    example: true,
    required: false,
  })
  messagesPushEnabled?: boolean;
}
