import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import {
  ATTRACTAP_CONVERSION_BLOCKERS,
  ATTRACTAP_CONVERSION_FAILURES,
  ATTRACTAP_CONVERSION_STATES,
  ATTRACTAP_PREFLIGHT_CHECKS,
  type AttractapConversionBlocker,
  type AttractapConversionFailure,
  type AttractapConversionState,
  type AttractapPreflightCheck,
} from '@attraccess/application-models';

export class StartSecureConversionDto {
  @ApiProperty({ description: 'The reader name, typed by the administrator to confirm' })
  @IsString()
  @MaxLength(256)
  confirmName: string;
}

export class SecureConversionEligibilityDto {
  @ApiProperty({ description: 'The variant is not hardware-tested: hide the action entirely' })
  hidden: boolean;

  @ApiProperty({
    description: 'Why the reader cannot be secured now; empty when it can',
    enum: ATTRACTAP_CONVERSION_BLOCKERS,
    isArray: true,
    enumName: 'AttractapConversionBlocker',
  })
  blockers: AttractapConversionBlocker[];
}

export class PreflightCheckResultDto {
  @ApiProperty({ enum: ATTRACTAP_PREFLIGHT_CHECKS, enumName: 'AttractapPreflightCheck' })
  check: AttractapPreflightCheck;

  @ApiProperty()
  ok: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Short display value, never secret' })
  value: string | null;
}

export class SecureConversionPreflightDto {
  @ApiProperty()
  ok: boolean;

  @ApiProperty({ type: [PreflightCheckResultDto] })
  checks: PreflightCheckResultDto[];
}

export class SecureConversionTargetDto {
  @ApiProperty() firmwareName: string;
  @ApiProperty() variant: string;
  @ApiProperty() version: string;
  @ApiProperty() secureVersion: number;
  @ApiProperty() appSha256: string;
  @ApiProperty() appSize: number;
  @ApiProperty() bootloaderSha256: string;
  @ApiProperty() bootloaderSize: number;
}

export class SecureConversionDto {
  @ApiProperty() id: number;
  @ApiProperty() readerId: number;

  @ApiProperty({ enum: ATTRACTAP_CONVERSION_STATES, enumName: 'AttractapConversionState' })
  state: AttractapConversionState;

  @ApiProperty({ enum: ATTRACTAP_CONVERSION_STATES, enumName: 'AttractapConversionState', nullable: true })
  failedInState: AttractapConversionState | null;

  @ApiProperty({ enum: ATTRACTAP_CONVERSION_FAILURES, enumName: 'AttractapConversionFailure', nullable: true })
  failureReason: AttractapConversionFailure | null;

  @ApiProperty({ type: SecureConversionTargetDto })
  target: SecureConversionTargetDto;

  @ApiProperty({ description: 'Secure Boot digest of the signing key (KEY0)' })
  digest0: string;

  @ApiProperty({ description: 'Secure Boot digest of the recovery key (KEY1)' })
  digest1: string;

  @ApiProperty({ type: [PreflightCheckResultDto], nullable: true })
  preflight: PreflightCheckResultDto[] | null;

  @ApiProperty() verified: boolean;
  @ApiProperty() bytesDone: number;
  @ApiProperty() bytesTotal: number;
  @ApiProperty() startedAt: Date;
  @ApiProperty() stateChangedAt: Date;
  @ApiProperty({ type: Date, nullable: true }) lastSeenAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) endedAt: Date | null;
}

export class SecureConversionStatusDto {
  @ApiProperty({ type: SecureConversionDto, nullable: true, description: "The reader's latest conversion" })
  conversion: SecureConversionDto | null;

  @ApiProperty({ description: 'The reader has a live session now' })
  online: boolean;

  @ApiProperty() canCancel: boolean;
  @ApiProperty() canRetry: boolean;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'Readers with recorded digests: whether a held key can sign their updates ("No signing key for this reader")',
  })
  signingKeyAvailable: boolean | null;
}

export class ActiveSecureConversionDto {
  @ApiProperty({ type: SecureConversionDto, nullable: true })
  conversion: SecureConversionDto | null;
}
