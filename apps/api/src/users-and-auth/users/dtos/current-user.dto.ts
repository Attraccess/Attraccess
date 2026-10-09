import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CurrentUserDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  locale!: string;

  @ApiProperty({ type: String, nullable: true })
  dateTimeLocale!: string | null;

  @ApiProperty()
  isEmailVerified!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  deletedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  externalIdentifier!: string | null;

  @ApiProperty()
  creditBalance!: number;

  @ApiProperty()
  billingFactor!: number;

  @ApiProperty({
    type: [String],
    description: 'Effective permission keys granted to this user via their assigned roles',
  })
  effectivePermissions!: string[];
}
