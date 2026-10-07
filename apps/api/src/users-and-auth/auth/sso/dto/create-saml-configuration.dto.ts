import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsStringArrayRecord } from './validators';

export class CreateSAMLConfigurationDto {
  @ApiProperty({
    description: 'Identity Provider SSO entry point URL',
    example: 'https://idp.example.com/realms/master/protocol/saml',
  })
  @IsString()
  @IsNotEmpty()
  entryPoint!: string;

  @ApiProperty({
    description: 'Service Provider issuer that IdP expects',
    example: 'https://api.attraccess.org',
  })
  @IsString()
  @IsNotEmpty()
  issuer!: string;

  @ApiProperty({
    description: 'Base64 encoded IdP certificate without PEM boundaries',
  })
  @IsString()
  @IsNotEmpty()
  certificate!: string;

  @ApiProperty({
    description: 'Audience restriction to validate against, defaults to issuer when omitted',
    required: false,
  })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  signRequest?: boolean;

  @ApiProperty({
    description: 'Require signed assertions inside the response',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  wantAssertionsSigned?: boolean;

  @ApiProperty({
    description: 'Require the overall response to be signed',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  wantAuthnResponseSigned?: boolean;

  @ApiProperty({
    description: 'Force IdP to re-authenticate the subject',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  forceAuthn?: boolean;

  @ApiProperty({
    description: 'Ordered list of attribute keys to resolve email addresses from (first match wins)',
    required: false,
    isArray: true,
    type: String,
    example: ['email', 'urn:oid:1.2.840.113549.1.9.1'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailAttributeKeys?: string[];

  @ApiProperty({
    description: 'Shared secret used to authorize SAML provisioning requests',
    required: false,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  provisioningSecret?: string;

  @ApiProperty({
    description:
      'Maps any Attraccess role key (system-provided or user-defined) to the SAML role/group attribute values that should grant it.',
    required: false,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { 'resource-manager': ['attraccess_resources'], 'my-custom-role': ['my_sso_group'] },
  })
  @IsOptional()
  @IsStringArrayRecord()
  roleMappings?: Record<string, string[]>;

  @ApiProperty({
    description: 'PEM encoded Service Provider certificate used when signing requests',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  spSigningCertificate?: string;

  @ApiProperty({
    description: 'PEM encoded Service Provider private key used for signing requests (stored encrypted)',
    required: false,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  spSigningPrivateKey?: string;
}
