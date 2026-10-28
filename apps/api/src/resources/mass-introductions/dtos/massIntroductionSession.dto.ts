import { ApiProperty } from '@nestjs/swagger';

export enum MassIntroductionTargetType {
  RESOURCE = 'resource',
  GROUP = 'group',
}

export enum MassIntroductionMethod {
  QR = 'qr',
  NFC = 'nfc',
}

export enum MassIntroductionReaderState {
  /** The reader shows the scan screen. */
  ACTIVE = 'active',
  /** The reader left the session (cancel button, disconnect); the QR code keeps working. */
  DETACHED = 'detached',
}

export class MassIntroductionTargetDto {
  @ApiProperty({ enum: MassIntroductionTargetType, enumName: 'MassIntroductionTargetType' })
  type!: MassIntroductionTargetType;

  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Laser cutter' })
  name!: string;
}

export class MassIntroductionReaderDto {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiProperty({ example: 'Workshop entrance' })
  name!: string;

  @ApiProperty({ enum: MassIntroductionReaderState, enumName: 'MassIntroductionReaderState' })
  state!: MassIntroductionReaderState;
}

export class MassIntroductionParticipantDto {
  @ApiProperty({ example: 7 })
  userId!: number;

  @ApiProperty({ example: 'alice' })
  username!: string;

  @ApiProperty({ enum: MassIntroductionMethod, enumName: 'MassIntroductionMethod' })
  method!: MassIntroductionMethod;

  @ApiProperty({ description: 'The user already had a valid introduction, so none was granted' })
  alreadyIntroduced!: boolean;

  @ApiProperty()
  joinedAt!: Date;
}

/** The introducer's view of a running mass-introduction session. */
export class MassIntroductionSessionDto {
  @ApiProperty({ description: 'Identifies the session in the introducer-only endpoints' })
  id!: string;

  @ApiProperty({
    description:
      'The current QR code value. It changes every 15 seconds, so only people in the room can use it; ' +
      'fetch the session again at tokenRefreshAt for the next one.',
  })
  token!: string;

  @ApiProperty({ description: 'When the QR code value changes' })
  tokenRefreshAt!: Date;

  @ApiProperty({ type: () => MassIntroductionTargetDto })
  target!: MassIntroductionTargetDto;

  @ApiProperty({ type: () => MassIntroductionReaderDto, nullable: true })
  reader!: MassIntroductionReaderDto | null;

  @ApiProperty({ type: () => [MassIntroductionParticipantDto] })
  participants!: MassIntroductionParticipantDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'When the QR code and reader stop accepting participants' })
  expiresAt!: Date;
}
