import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  PAIRING_FAILURE_REASONS,
  PAIRING_MODES,
  PAIRING_STATES,
  PairingFailureReason,
  PairingMode,
  PairingState,
  READER_KINDS,
  ReaderKind,
} from '../security/pairing-model';
import { LITE_COLOURS, LiteColour } from '../security/pairing-protocol';

export class PairingFirmwareDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  variant!: string;

  @ApiProperty()
  version!: string;
}

export class PairingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PAIRING_STATES })
  state!: PairingState;

  @ApiProperty({ enum: READER_KINDS })
  kind!: ReaderKind;

  @ApiProperty({ type: PairingFirmwareDto })
  firmware!: PairingFirmwareDto;

  @ApiProperty({ nullable: true, description: 'Reader record this device proved ownership of with its token' })
  boundReaderId!: number | null;

  @ApiProperty({ nullable: true, description: 'The reader record this request was paired to, once approved' })
  targetReaderId!: number | null;

  @ApiProperty({ nullable: true, enum: PAIRING_MODES })
  mode!: PairingMode | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({
    nullable: true,
    enum: PAIRING_FAILURE_REASONS,
    description: 'Why a pairing ended without completing',
  })
  failureReason!: PairingFailureReason | null;

  @ApiPropertyOptional({
    enum: LITE_COLOURS,
    isArray: true,
    nullable: true,
    description: 'Detail view of a Lite reader only: the eight colours on its ring, in ring order',
  })
  pattern?: LiteColour[] | null;

  @ApiPropertyOptional({ nullable: true, description: 'Detail view of a Lite reader only: the round of the pattern' })
  round?: number | null;
}

export class ResolvePairingDto {
  @ApiProperty({ description: 'The code shown on the reader; case, spaces and the hyphen do not matter' })
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class ApprovePairingDto {
  @ApiPropertyOptional({ description: 'Touch readers and the web flasher: the code shown on the reader' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ description: 'Lite readers: the round of the pattern that was compared (current or previous)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  round?: number;

  @ApiProperty({
    enum: PAIRING_MODES,
    description:
      'new: create a reader record; pair: pair the token reader that is connecting; takeover: bind the device to targetReaderId',
  })
  @IsIn(PAIRING_MODES)
  mode!: PairingMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  targetReaderId?: number;

  @ApiPropertyOptional({ description: 'Name of a new reader record' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ enum: ['flasher'], description: 'Set by the web flasher so the audit log can tell' })
  @IsOptional()
  @IsIn(['flasher'])
  via?: 'flasher';
}

export class RequestPairingResponseDto {
  @ApiProperty({ description: 'False when the reader is not connected with a token session right now' })
  requested!: boolean;
}
