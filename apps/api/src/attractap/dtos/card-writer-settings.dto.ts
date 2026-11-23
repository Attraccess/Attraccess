import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';

export const CARD_WRITER_MODES = ['all', 'selected'] as const;
export type CardWriterMode = (typeof CARD_WRITER_MODES)[number];

export class CardWriterSettingsDto {
  @ApiProperty({
    description: 'Which readers may enroll and reset cards: every reader, or only the selected ones',
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
  @IsOptional()
  @IsBoolean()
  allowUidOnlyCards?: boolean;
}
