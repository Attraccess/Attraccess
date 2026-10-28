import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { MassIntroductionTargetDto } from './massIntroductionSession.dto';

export class RedeemMassIntroductionDto {
  @ApiProperty({ description: 'The session id from the scanned QR code' })
  @IsString()
  @Length(8, 64)
  publicId!: string;

  @ApiProperty({ description: 'The code shown next to the QR code', example: '042917' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class RedeemMassIntroductionResponseDto {
  @ApiProperty({ type: () => MassIntroductionTargetDto })
  target!: MassIntroductionTargetDto;

  @ApiProperty({ description: 'The user already had a valid introduction, so none was granted' })
  alreadyIntroduced!: boolean;
}
