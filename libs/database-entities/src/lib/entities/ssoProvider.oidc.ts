import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { SSOProvider } from './ssoProvider.entity';
import { SystemPermission } from './user.entity';

@Entity()
export class SSOProviderOIDCConfiguration {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the provider',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the SSO provider',
    example: 1,
  })
  ssoProviderId!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The issuer of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh',
  })
  issuer!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The authorization URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/auth',
  })
  authorizationURL!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The token URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/token',
  })
  tokenURL!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The user info URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/userinfo',
  })
  userInfoURL!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The client ID of the provider',
    example: '1234567890',
  })
  clientId!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The client secret of the provider',
    example: '1234567890',
    writeOnly: true,
  })
  @Exclude()
  clientSecret!: string;

  @Column({ type: 'simple-array', nullable: true })
  @ApiProperty({
    description:
      'Optional list of OIDC scopes to request. The `openid` scope is added automatically and does not need to be listed here.',
    example: ['email', 'profile'],
    required: false,
  })
  scopes!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the username',
    example: ['preferred_username', 'email', 'sub'],
    required: false,
  })
  usernameClaimPaths!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the email',
    example: ['email', 'emails[0].value', 'upn'],
    required: false,
  })
  emailClaimPaths!: string[] | null;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({
    description: 'Optional mapping between Attraccess permissions and role names',
    required: false,
    example: {
      canManageResources: ['attraccess_resources'],
      canManageUsers: ['attraccess_admin'],
    },
  })
  permissionMappings?: Partial<Record<SystemPermission, string[]>> | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the user was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;

  @OneToOne(() => SSOProvider, (ssoProvider) => ssoProvider.oidcConfiguration)
  @JoinColumn({ name: 'ssoProviderId' })
  ssoProvider!: SSOProvider;
}
