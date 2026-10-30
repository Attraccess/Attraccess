import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type PairingFailureReason =
  | 'cancelled-at-reader'
  | 'cancelled-by-admin'
  | 'reader-disconnected'
  | 'protocol'
  | 'expired'
  | 'internal';

export const LITE_PATTERN_COLOURS = ['red', 'green', 'blue', 'yellow', 'white', 'magenta'] as const;

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

  @ApiProperty({ enum: ['waiting', 'completed', 'failed', 'cancelled', 'expired'] })
  state!: 'waiting' | 'completed' | 'failed' | 'cancelled' | 'expired';

  @ApiProperty({ enum: ['touch', 'lite'] })
  kind!: 'touch' | 'lite';

  @ApiProperty({ type: PairingFirmwareDto })
  firmware!: PairingFirmwareDto;

  @ApiProperty({ nullable: true, description: 'Reader record this device proved ownership of with its token' })
  boundReaderId!: number | null;

  @ApiProperty({ nullable: true, description: 'The reader record this request was paired to, once approved' })
  targetReaderId!: number | null;

  @ApiProperty({ nullable: true, enum: ['new', 'pair', 'takeover'] })
  mode!: 'new' | 'pair' | 'takeover' | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({
    nullable: true,
    enum: ['cancelled-at-reader', 'cancelled-by-admin', 'reader-disconnected', 'protocol', 'expired', 'internal'],
    description: 'Why a pairing ended without completing',
  })
  failureReason!: PairingFailureReason | null;

  @ApiPropertyOptional({
    enum: LITE_PATTERN_COLOURS,
    isArray: true,
    nullable: true,
    description: 'Detail view of a Lite reader only: the eight colours on its ring, in ring order',
  })
  pattern?: (typeof LITE_PATTERN_COLOURS)[number][] | null;

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
    enum: ['new', 'pair', 'takeover'],
    description:
      'new: create a reader record; pair: pair the token reader that is connecting; takeover: bind the device to targetReaderId',
  })
  @IsIn(['new', 'pair', 'takeover'])
  mode!: 'new' | 'pair' | 'takeover';

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
