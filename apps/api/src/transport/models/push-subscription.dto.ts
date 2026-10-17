import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class PushSubscription {
  @ApiProperty({ description: 'The unique identifier of the push subscription', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user this subscription belongs to', example: 1 })
  userId!: number;

  @ApiProperty({
    description: 'The push service endpoint URL that uniquely identifies this subscription (one per device/browser)',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  endpoint!: string;

  @ApiProperty({ description: 'The P-256 ECDH public key of the subscription, used to encrypt push payloads' })
  p256dh!: string;

  @ApiProperty({ description: 'The authentication secret of the subscription, used to encrypt push payloads' })
  auth!: string;

  @ApiProperty({
    description: 'The user agent of the browser that created this subscription, for display/debugging',
    example: 'Mozilla/5.0 (X11; Linux x86_64) ...',
    nullable: true,
  })
  userAgent!: string | null;

  @ApiProperty({ description: 'When this subscription was created', example: '2025-01-18T12:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    description: 'When this subscription was last re-confirmed by the client',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastSeenAt!: Date | null;

  @ApiProperty({ description: 'The user this subscription belongs to', type: () => User })
  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    endpoint: null,
    p256dh: null,
    auth: null,
    userAgent: null,
    createdAt: null,
    lastSeenAt: null,
    user: () => User,
  };
}
