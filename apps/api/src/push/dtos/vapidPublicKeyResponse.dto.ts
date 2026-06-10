import { ApiProperty } from '@nestjs/swagger';

export class VapidPublicKeyResponseDto {
  @ApiProperty({
    description:
      'The VAPID public key clients use to subscribe to push notifications. Auto-generated on first use.',
    example: 'BNc9oTcAcLWab5C8DUk...',
    type: String,
  })
  publicKey!: string;
}
