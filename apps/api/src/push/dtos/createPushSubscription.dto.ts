import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The P-256 ECDH public key of the subscription' })
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The authentication secret of the subscription' })
  auth!: string;
}

export class CreatePushSubscriptionDto {
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @ApiProperty({
    description: 'The push service endpoint URL of the subscription',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  @ApiProperty({ description: 'The encryption keys of the subscription', type: PushSubscriptionKeysDto })
  keys!: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'The user agent of the subscribing browser, for display/debugging',
    required: false,
  })
  userAgent?: string;
}
