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

@Entity()
export class SSOProviderSAMLConfiguration {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the SAML configuration',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the parent SSO provider',
    example: 3,
  })
  ssoProviderId!: number;

  @OneToOne(() => SSOProvider, (provider) => provider.samlConfiguration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ssoProviderId' })
  ssoProvider!: SSOProvider;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The Identity Provider entry point (SSO URL)',
    example: 'https://login.example.com/realms/master/protocol/saml',
  })
  entryPoint!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The Service Provider issuer URL presented to the IdP',
    example: 'https://app.attraccess.org',
  })
  issuer!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'PEM encoded IdP signing certificate (without BEGIN/END markers)',
  })
  certificate!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional audience restriction to validate within assertions',
    required: false,
    nullable: true,
  })
  audience?: string | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    default: false,
  })
  signRequest!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether SAML Assertions must include their own signature',
    default: false,
  })
  wantAssertionsSigned!: boolean;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description: 'Whether the SAML Response must be signed',
    default: true,
  })
  wantAuthnResponseSigned!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Force the IdP to re-authenticate the user',
    default: false,
  })
  forceAuthn!: boolean;

  @Column({ type: 'simple-array', nullable: true })
  @ApiProperty({
    description: 'Optional list of attribute keys (ordered) to resolve user emails from SAML assertions',
    required: false,
    isArray: true,
    type: String,
    example: ['email', 'urn:oid:1.2.840.113549.1.9.1'],
  })
  emailAttributeKeys?: string[] | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Shared secret used to authorize SAML provisioning requests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  @Exclude()
  provisioningSecret?: string | null;

  // ponytail: keeps the legacy 'permissionMappings' DB column — renaming it would need a migration for zero gain
  @Column({ type: 'json', nullable: true, name: 'permissionMappings' })
  @ApiProperty({
    description: 'Mapping between Attraccess role keys and SAML role/group attribute values',
    required: false,
    example: {
      'system-admin': ['attraccess_config_admin'],
      'billing-manager': ['attraccess_billing'],
    },
  })
  roleMappings?: Record<string, string[]> | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'PEM encoded Service Provider certificate used when signing AuthnRequests',
    required: false,
    nullable: true,
  })
  spSigningCertificate?: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Encrypted Service Provider private key used for signing AuthnRequests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  @Exclude()
  spSigningKeyEncrypted?: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Identifier for the encryption key used to protect the signing private key',
    required: false,
    nullable: true,
  })
  spSigningKeyEncryptionKeyId?: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the configuration was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the configuration was last updated',
  })
  updatedAt!: Date;
}
