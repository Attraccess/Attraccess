import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.dto';
import { Role } from './role.dto';
import { UserRoleSource } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class UserRole {
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

  @ApiProperty({
    description: 'SSO provider type, if source is sso',
    example: 'oidc',
    nullable: true,
    required: false,
  })
  ssoProviderType!: string | null;

  @ApiProperty({
    description: 'SSO provider ID, if source is sso',
    nullable: true,
    required: false,
  })
  ssoProviderId!: number | null;

  @ApiProperty({
    description: 'External value from SSO provider that triggered this assignment',
    nullable: true,
    required: false,
  })
  externalValue!: string | null;

  createdAt!: Date;

  updatedAt!: Date;

  user!: User;

  @ApiPropertyOptional({ type: () => Role, description: 'The role object, populated when loaded with relations' })
  role!: Role;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    roleId: null,
    source: null,
    ssoProviderType: null,
    ssoProviderId: null,
    externalValue: null,
    createdAt: null,
    updatedAt: null,
    user: () => User,
    role: () => Role,
  };
}

export { UserRoleSource } from '@attraccess/application-models';
