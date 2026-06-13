import { ApiProperty } from '@nestjs/swagger';

export class VapidConfigDto {
  @ApiProperty({
    description: 'The currently active VAPID public key',
    example: 'BNc9oTcAcLWab5C8DUk...',
    type: String,
  })
  publicKey!: string;

  @ApiProperty({
    description: 'Number of push subscriptions currently registered (these break when the keys are replaced)',
    example: 12,
  })
  subscriptionCount!: number;
}
