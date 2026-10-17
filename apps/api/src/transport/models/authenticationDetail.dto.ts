import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.dto';
import { AuthenticationType } from '@attraccess/application-models';
import { SSOProviderType } from './ssoProvider.dto';
import type { ResponseFields } from '../response-mapper';

export class AuthenticationDetail {
  @ApiProperty({
    description: 'The unique identifier of the authentication detail',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the user',
    example: 1,
  })
  userId!: number;

  @ApiProperty({
    description: 'The type of authentication',
    enum: AuthenticationType,
    example: AuthenticationType.LOCAL_PASSWORD,
    enumName: 'AuthenticationType',
  })
  type!: AuthenticationType;

  @Exclude()
  @ApiProperty({
    description: 'The hashed password (for local authentication)',
    required: false,
  })
  password?: string;

  @ApiProperty({
    description: 'The SSO provider type (for SSO authentication)',
    enum: SSOProviderType,
    enumName: 'SSOProviderType',
    required: false,
  })
  providerType?: SSOProviderType | null;

  @ApiProperty({
    description: 'The SSO provider ID (for SSO authentication)',
    required: false,
  })
  providerId?: number | null;

  @ApiProperty({
    description: 'The SSO subject/ID from the provider',
    required: false,
  })
  ssoSubject?: string | null;

  @Exclude()
  @ApiProperty({
    description: 'The TOTP secret (for authenticator apps)',
    required: false,
  })
  totpSecret?: string | null;

  @Exclude()
  @ApiProperty({
    description: 'When TOTP was enabled for the user',
    required: false,
  })
  totpEnabledAt?: Date | null;

  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    type: null,
    providerType: null,
    providerId: null,
    ssoSubject: null,
    user: () => User,
  };
}
