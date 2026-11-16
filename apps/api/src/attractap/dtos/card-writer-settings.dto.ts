import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt } from 'class-validator';

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
}
