import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { SSOProviderOIDCConfiguration } from './ssoProvider.oidc';
import { SSOProviderSAMLConfiguration } from './ssoProvider.saml';
import { IsEnum } from 'class-validator';

export enum SSOProviderType {
  OIDC = 'OIDC',
  SAML = 'SAML',
}

@Entity()
export class SSOProvider {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the provider',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The internal name of the provider',
    example: 'Keycloak',
  })
  name!: string;

  @Column({
    type: 'simple-enum',
    enum: SSOProviderType,
  })
  @ApiProperty({
    description: 'The type of the provider',
    example: 'OIDC',
    enum: SSOProviderType,
    enumName: 'SSOProviderType',
  })
  @IsEnum(SSOProviderType)
  type!: SSOProviderType;

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

  @OneToOne(() => SSOProviderOIDCConfiguration, (oidcConfiguration) => oidcConfiguration.ssoProvider)
  @ApiProperty({
    description: 'The OIDC configuration of the provider',
    type: SSOProviderOIDCConfiguration,
    required: false,
  })
  oidcConfiguration?: SSOProviderOIDCConfiguration;

  @OneToOne(() => SSOProviderSAMLConfiguration, (samlConfiguration) => samlConfiguration.ssoProvider)
  @ApiProperty({
    description: 'The SAML configuration of the provider',
    type: SSOProviderSAMLConfiguration,
    required: false,
  })
  samlConfiguration?: SSOProviderSAMLConfiguration;
}
