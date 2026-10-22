import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { SSOProvider } from './ssoProvider.dto';
import type { ResponseFields } from '../response-mapper';

export class SSOProviderSAMLConfiguration {
  @ApiProperty({
    description: 'The unique identifier of the SAML configuration',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the parent SSO provider',
    example: 3,
  })
  ssoProviderId!: number;

  ssoProvider!: SSOProvider;

  @ApiProperty({
    description: 'The Identity Provider entry point (SSO URL)',
    example: 'https://login.example.com/realms/master/protocol/saml',
  })
  entryPoint!: string;

  @ApiProperty({
    description: 'The Service Provider issuer URL presented to the IdP',
    example: 'https://app.attraccess.org',
  })
  issuer!: string;

  @ApiProperty({
    description: 'PEM encoded IdP signing certificate (without BEGIN/END markers)',
  })
  certificate!: string;

  @ApiProperty({
    description: 'Optional audience restriction to validate within assertions',
    required: false,
    nullable: true,
  })
  audience?: string | null;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    default: false,
  })
  signRequest!: boolean;

  @ApiProperty({
    description: 'Whether SAML Assertions must include their own signature',
    default: false,
  })
  wantAssertionsSigned!: boolean;

  @ApiProperty({
    description: 'Whether the SAML Response must be signed',
    default: true,
  })
  wantAuthnResponseSigned!: boolean;

  @ApiProperty({
    description: 'Force the IdP to re-authenticate the user',
    default: false,
  })
  forceAuthn!: boolean;

  @ApiProperty({
    description: 'Optional list of attribute keys (ordered) to resolve user emails from SAML assertions',
    required: false,
    isArray: true,
    type: String,
    example: ['email', 'urn:oid:1.2.840.113549.1.9.1'],
  })
  emailAttributeKeys?: string[] | null;

  @ApiProperty({
    description: 'Shared secret used to authorize SAML provisioning requests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  @Exclude()
  provisioningSecret?: string | null;

  // ponytail: keeps the legacy 'permissionMappings' DB column — renaming it would need a migration for zero gain

  @ApiProperty({
    description: 'Mapping between Attraccess role keys and SAML role/group attribute values',
    required: false,
    example: {
      'system-admin': ['attraccess_config_admin'],
      'billing-manager': ['attraccess_billing'],
    },
  })
  roleMappings?: Record<string, string[]> | null;

  @ApiProperty({
    description: 'PEM encoded Service Provider certificate used when signing AuthnRequests',
    required: false,
    nullable: true,
  })
  spSigningCertificate?: string | null;

  @ApiProperty({
    description: 'Encrypted Service Provider private key used for signing AuthnRequests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  @Exclude()
  spSigningKeyEncrypted?: string | null;

  @ApiProperty({
    description: 'Identifier for the encryption key used to protect the signing private key',
    required: false,
    nullable: true,
  })
  spSigningKeyEncryptionKeyId?: string | null;

  @ApiProperty({
    description: 'Identity Provider entity ID (distinct from the Service Provider issuer)',
    required: false,
    nullable: true,
  })
  idpIssuer?: string | null;

  @ApiProperty({ description: 'Identity Provider Single Logout endpoint', required: false, nullable: true })
  logoutURL?: string | null;

  @ApiProperty({
    description: 'When the configuration was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the configuration was last updated',
  })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    ssoProviderId: null,
    ssoProvider: () => SSOProvider,
    entryPoint: null,
    issuer: null,
    certificate: null,
    audience: null,
    signRequest: null,
    wantAssertionsSigned: null,
    wantAuthnResponseSigned: null,
    forceAuthn: null,
    emailAttributeKeys: null,
    roleMappings: null,
    spSigningCertificate: null,
    spSigningKeyEncryptionKeyId: null,
    idpIssuer: null,
    logoutURL: null,
    createdAt: null,
    updatedAt: null,
  };
}
