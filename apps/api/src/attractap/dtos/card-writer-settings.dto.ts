import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';

/** `secured`: only readers the server checked as secured (eFuse report, ATT-1208) may write cards. */
export const CARD_WRITER_MODES = ['all', 'selected', 'secured'] as const;
export type CardWriterMode = (typeof CARD_WRITER_MODES)[number];

export class CardWriterSettingsDto {
  @ApiProperty({
    description:
      'Which readers may enroll and reset cards: every reader, only the selected ones, or only secured readers',
    enum: CARD_WRITER_MODES,
  })
  @IsIn(CARD_WRITER_MODES)
  mode: CardWriterMode;

  @ApiProperty({ description: 'Readers allowed to enroll and reset cards when the mode is "selected"', type: [Number] })
  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  readerIds: number[];

  @ApiProperty({
    description:
      'Dangerous. Lets cards that only offer a UID and no AES authentication be enrolled and used. Such cards can be copied with cheap tools. Off when not set. Left unchanged when omitted on update.',
    required: false,
  })
  // Strict: the global implicit conversion would turn the string "false" into true, and this switch is dangerous.
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsBoolean()
  allowUidOnlyCards?: boolean;
}

/** Body of the switch that allows UID-only cards. It changes nothing else, so it cannot undo a reader-list change. */
export class UidOnlyCardsSettingDto {
  @ApiProperty({
    description:
      'Dangerous. Lets cards that only offer a UID and no AES authentication be enrolled and used. Such cards can be copied with cheap tools.',
  })
  // Strict: the global implicit conversion would turn the string "false" into true, and this switch is dangerous.
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  allowUidOnlyCards: boolean;
}
