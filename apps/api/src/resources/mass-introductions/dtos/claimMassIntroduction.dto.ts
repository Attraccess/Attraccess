import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ClaimMassIntroductionDto {
  @ApiProperty({ description: 'The value of the scanned mass-introduction QR code' })
  @IsString()
  @Length(10, 128)
  token!: string;
}

/** Proof of a recent scan; redeem it after signing in. */
export class MassIntroductionTicketDto {
  @ApiProperty({ description: 'Single-use ticket for POST /mass-introductions/redeem' })
  ticket!: string;

  @ApiProperty()
  expiresAt!: Date;
}
