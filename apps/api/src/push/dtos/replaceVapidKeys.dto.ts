import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ReplaceVapidKeysDto {
  @ApiPropertyOptional({
    description:
      'Custom base64url-encoded VAPID public key. Omit both keys to auto-generate a fresh pair instead.',
    example: 'BNc9oTcAcLWab5C8DUk...',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  publicKey?: string;

  @ApiPropertyOptional({
    description: 'Custom base64url-encoded VAPID private key. Must be provided together with the public key.',
    example: 'k8GZ1lDcVKzRYbXQ...',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  privateKey?: string;
}

export class ReplaceVapidKeysResponseDto {
  @ApiProperty({
    description: 'The new active VAPID public key',
    example: 'BNc9oTcAcLWab5C8DUk...',
    type: String,
  })
  publicKey!: string;

  @ApiProperty({
    description: 'Number of push subscriptions that were deleted because they were bound to the old key',
    example: 12,
  })
  deletedSubscriptions!: number;
}
