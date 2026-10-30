import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class PairingCodeDto {
  @ApiProperty({ enum: ['digits', 'colours'] })
  kind!: 'digits' | 'colours';

  @ApiProperty({
    description: 'Six digits for Touch readers, or eight colour names for Lite readers',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  value!: string | string[];
}

export class PairingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['announced', 'awaiting-confirmation', 'completed', 'failed', 'cancelled', 'expired'] })
  state!: 'announced' | 'awaiting-confirmation' | 'completed' | 'failed' | 'cancelled' | 'expired';

  @ApiProperty({ enum: ['touch', 'lite'] })
  kind!: 'touch' | 'lite';

  @ApiProperty({ nullable: true, description: 'Reader record this device proved ownership of with its token' })
  boundReaderId!: number | null;

  @ApiProperty({ nullable: true })
  targetReaderId!: number | null;

  @ApiProperty({ nullable: true, enum: ['new', 'pair', 'repair', 'replace'] })
  mode!: 'new' | 'pair' | 'repair' | 'replace' | null;

  @ApiProperty({ description: 'Short fingerprint of the reader key' })
  keyFingerprint!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  @ApiProperty({ type: PairingCodeDto, nullable: true, description: 'Only present once a pairing was started' })
  code!: PairingCodeDto | null;

  @ApiProperty()
  readerConfirmed!: boolean;

  @ApiProperty()
  adminConfirmed!: boolean;

  @ApiProperty({
    nullable: true,
    enum: ['cancelled-at-reader', 'cancelled-by-admin', 'reader-disconnected', 'protocol', 'expired', 'internal'],
    description: 'Why a pairing ended without completing',
  })
  failureReason!: PairingFailureReason | null;
}

export type PairingFailureReason =
  'cancelled-at-reader' | 'cancelled-by-admin' | 'reader-disconnected' | 'protocol' | 'expired' | 'internal';

export class StartPairingDto {
  @ApiProperty({
    enum: ['new', 'pair', 'repair', 'replace'],
    description:
      'new: create a reader record; pair: upgrade the token reader that is connecting; repair/replace: bind the device to targetReaderId',
  })
  @IsIn(['new', 'pair', 'repair', 'replace'])
  mode!: 'new' | 'pair' | 'repair' | 'replace';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  targetReaderId?: number;
}

export class RequestPairingResponseDto {
  @ApiProperty({ description: 'False when the reader is not connected with a token session right now' })
  requested!: boolean;
}
