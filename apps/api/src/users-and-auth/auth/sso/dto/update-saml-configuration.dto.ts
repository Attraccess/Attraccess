import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsStringArrayRecord } from './validators';

export class UpdateSAMLConfigurationDto {
  @ApiProperty({
    description: 'Identity Provider SSO entry point URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  entryPoint?: string;

  @ApiProperty({
    description: 'Service Provider issuer that IdP expects',
    required: false,
  })
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiProperty({
    description: 'Optional Assertion Consumer Service override',
    required: false,
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({
    description: 'Base64 encoded IdP certificate without PEM boundaries',
    required: false,
  })
  @IsOptional()
  @IsString()
  certificate?: string;

  @ApiProperty({
    description: 'Audience restriction to validate against',
    required: false,
  })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  signRequest?: boolean;

  @ApiProperty({
    description: 'Require signed assertions inside the response',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  wantAssertionsSigned?: boolean;

  @ApiProperty({
    description: 'Require the overall response to be signed',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  wantAuthnResponseSigned?: boolean;

  @ApiProperty({
    description: 'Force IdP to re-authenticate the subject',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
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
