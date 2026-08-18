import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '@attraccess/database-entities';

export class GuestDto {
  @ApiProperty({ description: 'The unique identifier of the guest', example: 42 })
  id: number;

  @ApiProperty({ description: 'The display name of the guest', example: 'John Doe' })
  name: string;

  @ApiProperty({
    description: 'The optional contact email of the guest',
    example: 'john@example.com',
    required: false,
    nullable: true,
  })
  email: string | null;

  @ApiProperty({ description: 'The type of the user account', enum: UserType, enumName: 'UserType' })
  userType: UserType;

  @ApiProperty({
    description: 'The short numeric code the guest uses to identify themselves at a terminal',
    example: '1234',
    required: false,
    nullable: true,
  })
  guestCode: string | null;

  @ApiProperty({ description: 'Whether the guest account is enabled', example: true })
  guestEnabled: boolean;

  @ApiProperty({ description: 'Whether the guest currently has an active TOTP credential', example: true })
  hasCredential: boolean;

  @ApiProperty({ description: 'When the guest was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the guest was last updated' })
  updatedAt: Date;
}
