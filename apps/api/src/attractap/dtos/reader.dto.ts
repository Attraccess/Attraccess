import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';
import {
  ATTRACTAP_FIRMWARE_PROFILES,
  ATTRACTAP_SECURITY_PROBLEMS,
  type AttractapFirmwareInfo,
  type AttractapFirmwareProfile,
  type AttractapLinkedResource,
  type AttractapPairingState,
  type AttractapReader,
  type AttractapReaderCapabilities,
  type AttractapSecurityProblem,
} from '@attraccess/application-models';

/** Schema names match the published API: the generated clients know these as AttractapCapabilities etc. */
@ApiSchema({ name: 'AttractapCapabilities' })
export class AttractapCapabilitiesDto {
  @ApiProperty({
    description: 'Whether the reader can choose from many linked resources or can only handle one',
    example: true,
    default: true,
  })
  resourceSelection!: boolean;

  @ApiProperty({
    description:
      'Whether the reader has interface options for triggering resource actions, if not a actions is triggered immediately upon scanning a nfc card',
    example: true,
    default: true,
  })
  resourceActionSelection!: boolean;

  @ApiProperty({
    description: 'Whether the reader can enroll new cards',
    example: true,
    default: true,
  })
  cardEnrollment!: boolean;

  @ApiProperty({
    description: 'Whether the reader has addressable LEDs',
    example: false,
    default: false,
  })
  hasLeds!: boolean;

  @ApiProperty({
    description:
      'Whether the reader relays card APDUs to the server and holds no card keys (firmware 2.0.0 and later). Readers without it get no card functions.',
    example: true,
    default: false,
  })
  cardRelay!: boolean;

  @ApiProperty({
    description:
      'Reader UI capabilities (schema version, components, slots, steps, display, input, feedback). Null means schemaVersion 0 (no plugin UI).',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  ui!: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Last reset reason the reader reported (e.g. POWERON, PANIC, TASK_WDT)',
    example: 'POWERON',
    nullable: true,
  })
  resetReason!: string | null;
}

@ApiSchema({ name: 'AttractapFirmwareVersion' })
export class AttractapFirmwareVersionDto {
  @ApiProperty({ description: 'The name of the firmware', example: 'Attractap', nullable: true })
  name!: string | null;

  @ApiProperty({ description: 'The variant of the firmware', example: 'eth', nullable: true })
  variant!: string | null;

  @ApiProperty({ description: 'The version of the firmware', example: '1.0.0', nullable: true })
  version!: string | null;

  @ApiProperty({ description: 'The capabilities of the reader', type: () => AttractapCapabilitiesDto })
  capabilities!: AttractapReaderCapabilities;
}

/** A reader as the API publishes it.  */
@ApiSchema({ name: 'Attractap' })
export class AttractapReaderDto {
  @ApiProperty({ description: 'The ID of the reader' })
  id!: number;

  @ApiProperty({ description: 'The name of the reader' })
  name!: string;

  @ApiProperty({
    description: 'Pairing state: paired (TLS identity) or revoked (no active credential)',
    enum: ['paired', 'revoked'],
    default: 'revoked',
  })
  pairingState!: AttractapPairingState;

  @ApiProperty({ description: 'SHA-256 fingerprint of the current reader public key', nullable: true })
  credentialFingerprint!: string | null;

  @ApiProperty({ description: 'Secure Boot digest burned to KEY0 (signing key), hex', nullable: true })
  secureBootDigest0!: string | null;

  @ApiProperty({ description: 'Secure Boot digest burned to KEY1 (recovery key), hex', nullable: true })
  secureBootDigest1!: string | null;

  @ApiProperty({
    description: "Secure Boot digest of the key the server signs this reader's images with, hex",
    nullable: true,
  })
  secureBootSignerDigest!: string | null;

  @ApiProperty({ description: 'When the reader was paired', nullable: true })
  pairedAt!: Date | null;

  @ApiProperty({ description: 'Expiry of the current reader certificate', nullable: true })
  certificateNotAfter!: Date | null;

  @ApiProperty({ description: 'Serial number of the current reader certificate', nullable: true })
  certificateSerial!: string | null;

  @ApiProperty({
    description:
      'True when the last eFuse report matched the secure profile on a release build and the paired P-256 session',
    default: false,
  })
  secured!: boolean;

  @ApiProperty({ description: 'When the reader last became secured', nullable: true })
  securedAt!: Date | null;

  @ApiProperty({
    description: 'Firmware profile the reader reported (a claim, not attestation)',
    enum: ATTRACTAP_FIRMWARE_PROFILES,
    nullable: true,
  })
  firmwareProfile!: AttractapFirmwareProfile | null;

  @ApiProperty({
    description:
      'Anti-rollback secure_version of the running app image, as the reader reported it in its firmware info. ' +
      'Compare with efuseSecureVersion: the image runs only while this is at least the eFuse value.',
    nullable: true,
  })
  secureVersion!: number | null;

  @ApiProperty({
    description: "The chip's eFuse SECURE_VERSION (anti-rollback floor), from the reader's last eFuse report",
    nullable: true,
  })
  efuseSecureVersion!: number | null;

  @ApiProperty({ description: 'When the server last checked an eFuse report of the reader', nullable: true })
  securityReportCheckedAt!: Date | null;

  @ApiProperty({
    description:
      'Problem codes of the last security check (build and eFuse report); empty when it passed, ' +
      'null when no eFuse report was received',
    enum: ATTRACTAP_SECURITY_PROBLEMS,
    isArray: true,
    nullable: true,
  })
  securityReportProblems!: AttractapSecurityProblem[] | null;

  @ApiProperty({
    description: 'The resources that the reader has access to',
    type: 'array',
    items: { $ref: getSchemaPath('Resource') },
  })
  resources?: AttractapLinkedResource[];

  @ApiProperty({ description: 'The last time the reader connected to the server' })
  lastConnection!: Date;

  @ApiProperty({ description: 'The first time the reader connected to the server' })
  firstConnection!: Date;

  @ApiProperty({
    description: 'Global LED brightness for the reader (0-255)',
    example: 255,
    default: 255,
    minimum: 0,
    maximum: 255,
  })
  ledBrightness!: number;

  @ApiProperty({
    description:
      'Whether backend plugins with the BLE_TRANSPORT permission may scan for and connect to Bluetooth devices through this reader',
    example: false,
    default: false,
  })
  allowPluginBle!: boolean;

  @ApiProperty({ description: 'The firmware of the reader', type: () => AttractapFirmwareVersionDto })
  firmware!: AttractapFirmwareInfo;
}

/** Explicit mapping: internal fields stay behind. */
export function toReaderDto(reader: AttractapReader): AttractapReaderDto {
  return {
    id: reader.id,
    name: reader.name,
    pairingState: reader.pairingState,
    credentialFingerprint: reader.credentialFingerprint,
    secureBootDigest0: reader.secureBootDigest0,
    secureBootDigest1: reader.secureBootDigest1,
    secureBootSignerDigest: reader.secureBootSignerDigest,
    pairedAt: reader.pairedAt,
    certificateNotAfter: reader.certificateNotAfter,
    certificateSerial: reader.certificateSerial,
    secured: reader.secured,
    securedAt: reader.securedAt,
    firmwareProfile: reader.firmwareProfile,
    secureVersion: reader.secureVersion,
    efuseSecureVersion: reader.efuseSecureVersion,
    securityReportCheckedAt: reader.securityReportCheckedAt,
    securityReportProblems: reader.securityReportProblems,
    ...(reader.resources ? { resources: reader.resources } : {}),
    lastConnection: reader.lastConnection,
    firstConnection: reader.firstConnection,
    ledBrightness: reader.ledBrightness,
    allowPluginBle: reader.allowPluginBle,
    firmware: reader.firmware,
  };
}
