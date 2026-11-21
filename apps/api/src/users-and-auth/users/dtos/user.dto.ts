import { AuthenticationType, SSOProviderType, UserRoleSource, type UserProfile } from '@attraccess/application-models';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import type { AccountCredentialRecord, UserAccount, UserRoleRecord } from '@attraccess/application-models';
import { RoleDto, toRoleDto } from '../../rbac/dtos/role.dto';

/** The authentication detail schema of the API; secrets (password hash, TOTP secret) are not part of it. */
@ApiSchema({ name: 'AuthenticationDetail' })
export class AuthenticationDetailDto {
  @ApiProperty({ description: 'The unique identifier of the authentication detail', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user', example: 1 })
  userId!: number;

  @ApiProperty({
    description: 'The type of authentication',
    enum: AuthenticationType,
    example: AuthenticationType.LOCAL_PASSWORD,
    enumName: 'AuthenticationType',
  })
  type!: AuthenticationType;

  @ApiProperty({
    description: 'The SSO provider type (for SSO authentication)',
    enum: SSOProviderType,
    enumName: 'SSOProviderType',
    required: false,
  })
  providerType?: SSOProviderType | null;

  @ApiProperty({ description: 'The SSO provider ID (for SSO authentication)', required: false })
  providerId?: number | null;

  @ApiProperty({ description: 'The SSO subject/ID from the provider', required: false })
  ssoSubject?: string | null;
}

@ApiSchema({ name: 'UserRole' })
export class UserRoleDto {
  id!: number;

  userId!: number;

  @ApiProperty({ description: 'ID of the assigned role' })
  roleId!: number;

  @ApiProperty({
    description: 'How this role was assigned to the user',
    enum: UserRoleSource,
    example: UserRoleSource.MANUAL,
  })
  source!: UserRoleSource;

  @ApiProperty({ description: 'SSO provider type, if source is sso', example: 'oidc', nullable: true, required: false })
  ssoProviderType!: string | null;

  @ApiProperty({ description: 'SSO provider ID, if source is sso', nullable: true, required: false })
  ssoProviderId!: number | null;

  @ApiProperty({
    description: 'External value from SSO provider that triggered this assignment',
    nullable: true,
    required: false,
  })
  externalValue!: string | null;

  @ApiPropertyOptional({ type: () => RoleDto, description: 'The role object, populated when loaded with relations' })
  role?: RoleDto;

  createdAt!: Date;

  updatedAt!: Date;
}

/** The user schema of the API. It lists only public fields: email, tokens and lockout state are never mapped. */
@ApiSchema({ name: 'User' })
export class UserDto implements UserProfile {
  @ApiProperty({ description: 'The unique identifier of the user', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The username of the user', example: 'johndoe' })
  username!: string;

  @ApiProperty({ type: String, nullable: true, description: 'The first name of the user', example: 'Ada' })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'The last name of the user', example: 'Lovelace' })
  lastName!: string | null;

  @ApiProperty({ description: "The user's preferred locale (BCP 47 language tag)", example: 'en' })
  locale!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Formatting locale; null follows app language' })
  dateTimeLocale!: string | null;

  @ApiProperty({ description: 'Whether the user has verified their email address', example: true })
  isEmailVerified!: boolean;

  isDisabled!: boolean;

  @ApiProperty({ description: 'When the user was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the user was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'When the user was soft-deleted', required: false })
  deletedAt?: Date | null;

  @ApiProperty({
    type: [AuthenticationDetailDto],
    description: 'Authentication details linked to the user',
    required: false,
  })
  authenticationDetails?: AuthenticationDetailDto[];

  @ApiProperty({
    description: 'The external (origin) identifier of the user, if the user is authenticated via SSO',
    example: '1234567890',
    nullable: true,
    required: false,
  })
  externalIdentifier!: string | null;

  @ApiProperty({ description: 'The credit balance of the user' })
  creditBalance!: number;

  @ApiProperty({
    description: 'The percentage rate the user to actually pay for activities that cost credits',
    example: 100,
  })
  billingFactor!: number;

  @ApiProperty({ type: [UserRoleDto], description: 'Role assignments for this user', required: false })
  userRoles?: UserRoleDto[];
}

/** Maps a stored user to the public user shape. Only the listed fields leave the server. */
export function toUserDto(user: UserProfile): UserDto {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    externalIdentifier: user.externalIdentifier,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

function toAuthenticationDetailDto(detail: AccountCredentialRecord): AuthenticationDetailDto {
  return {
    id: detail.id,
    userId: detail.userId,
    type: detail.type,
    providerType: detail.providerType,
    providerId: detail.providerId,
    ssoSubject: detail.ssoSubject,
  };
}

/** Maps a user with the relations that were loaded. Email, tokens and lockout state are never mapped. */
export function toUserAccountDto(account: UserAccount): UserDto {
  return {
    ...toUserDto(account),
    ...(account.authenticationDetails
      ? { authenticationDetails: account.authenticationDetails.map(toAuthenticationDetailDto) }
      : {}),
    ...(account.userRoles ? { userRoles: account.userRoles.map(toUserRoleDto) } : {}),
  };
}

export function toUserRoleDto(userRole: UserRoleRecord): UserRoleDto {
  return {
    id: userRole.id,
    userId: userRole.userId,
    roleId: userRole.roleId,
    source: userRole.source,
    ssoProviderType: userRole.ssoProviderType,
    ssoProviderId: userRole.ssoProviderId,
    externalValue: userRole.externalValue,
    createdAt: userRole.createdAt,
    updatedAt: userRole.updatedAt,
    ...(userRole.role ? { role: toRoleDto(userRole.role) } : {}),
  };
}
