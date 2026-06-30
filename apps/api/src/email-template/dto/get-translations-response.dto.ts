import { ApiProperty } from '@nestjs/swagger';

export class TranslationKeyDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  defaultValue: string;
}

export class GetTranslationsResponseDto {
  @ApiProperty({ type: [TranslationKeyDto] })
  keys: TranslationKeyDto[];

  @ApiProperty({ description: 'locale → key → translated value' })
  translations: Record<string, Record<string, string>>;
}
