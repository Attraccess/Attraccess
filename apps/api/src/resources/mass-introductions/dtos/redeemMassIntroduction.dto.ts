import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { MassIntroductionTargetDto } from './massIntroductionSession.dto';

export class RedeemMassIntroductionDto {
  @ApiProperty({ description: 'The token from the scanned mass-introduction QR code' })
  @IsString()
  @Length(16, 128)
  token!: string;
}

export class RedeemMassIntroductionResponseDto {
  @ApiProperty({ type: () => MassIntroductionTargetDto })
  target!: MassIntroductionTargetDto;

  @ApiProperty({ description: 'The user already had a valid introduction, so none was granted' })
  alreadyIntroduced!: boolean;
}
