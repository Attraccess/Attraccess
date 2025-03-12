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
import { SSOProvider } from './ssoProvider.entity';

@Entity()
export class SSOProviderOIDCConfiguration {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the provider',
    example: 1,
  })
  id!: number;

  @Column()
  @ApiProperty({
    description: 'The ID of the SSO provider',
    example: 1,
  })
  ssoProviderId!: number;

  @Column()
  @ApiProperty({
    description: 'The issuer of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh',
  })
  issuer!: string;

  @Column()
  @ApiProperty({
    description: 'The authorization URL of the provider',
    example:
      'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/auth',
  })
  authorizationURL!: string;

  @Column()
  @ApiProperty({
    description: 'The token URL of the provider',
    example:
      'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/token',
  })
  tokenURL!: string;

  @Column()
  @ApiProperty({
    description: 'The user info URL of the provider',
    example:
      'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/userinfo',
  })
  userInfoURL!: string;

  @Column()
  @ApiProperty({
    description: 'The client ID of the provider',
    example: '1234567890',
  })
  clientId!: string;

  @Column()
  @ApiProperty({
    description: 'The client secret of the provider',
    example: '1234567890',
  })
  clientSecret!: string;

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
