import { ApiProperty } from '@nestjs/swagger';

export class VapidPublicKeyResponseDto {
  @ApiProperty({
    description:
      'The VAPID public key clients use to subscribe to push notifications. Null when push is not configured on this server.',
    example: 'BNc9oTcAcLWab5C8DUk...',
    nullable: true,
    type: String,
  })
  publicKey!: string | null;
}
