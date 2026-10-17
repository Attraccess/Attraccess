import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class NotificationPreference {
  @ApiProperty({ description: 'The unique identifier of the notification preference entry', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user these preferences belong to', example: 1 })
  userId!: number;

  @ApiProperty({
    description:
      'Whether to send an email fallback when a direct message arrives while the user is offline. Defaults to true (opt-out).',
    example: true,
    default: true,
  })
  messagesEmailOnOffline!: boolean;

  @ApiProperty({
    description:
      'Whether to send a browser push notification when a direct message arrives while the user is offline. Defaults to true (opt-out).',
    example: true,
    default: true,
  })
  messagesPushEnabled!: boolean;

  @ApiProperty({
    description: 'JSON map of notification categories to enabled channels.',
    required: false,
    nullable: true,
  })
  categoryChannels!: string | null;

  @ApiProperty({ description: 'The user these preferences belong to', type: () => User })
  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    messagesEmailOnOffline: null,
    messagesPushEnabled: null,
    categoryChannels: null,
    user: () => User,
  };
}
