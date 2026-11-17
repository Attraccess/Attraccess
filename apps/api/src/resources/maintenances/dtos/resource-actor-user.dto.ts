import { ApiProperty } from '@nestjs/swagger';
import type { ResourceActorUser } from '@attraccess/application-models';

/** The user shown next to a maintenance action (created, completed, resolved by). */
export class ResourceActorUserDto implements ResourceActorUser {
  @ApiProperty({ description: 'The unique identifier of the user', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The username of the user', example: 'johndoe' })
  username!: string;

  @ApiProperty({ description: 'The preferred language of the user', example: 'en' })
  locale!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Formatting locale; null follows app language' })
  dateTimeLocale!: string | null;

  @ApiProperty({ description: 'Whether the email address of the user is verified', example: true })
  isEmailVerified!: boolean;

  @ApiProperty({ description: 'Whether the account is disabled' })
  isDisabled!: boolean;

  @ApiProperty({ description: 'When the user was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the user was last updated' })
  updatedAt!: Date;

  @ApiProperty({ type: Date, nullable: true, required: false, description: 'When the user was deleted' })
  deletedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Identifier at an external provider' })
  externalIdentifier!: string | null;

  @ApiProperty({ description: 'The credit balance of the user' })
  creditBalance!: number;

  @ApiProperty({ description: 'The billing factor of the user in percent', example: 100 })
  billingFactor!: number;
}
