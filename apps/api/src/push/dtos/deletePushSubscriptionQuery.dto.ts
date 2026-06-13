import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeletePushSubscriptionQueryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The push service endpoint URL of the subscription to delete',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  endpoint!: string;
}
