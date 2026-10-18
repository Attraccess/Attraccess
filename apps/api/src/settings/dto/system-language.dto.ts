import { ApiProperty } from '@nestjs/swagger';

/** Public language configuration; contains no administrative settings. */
export class SystemLanguageDto {
  @ApiProperty({ description: 'Default language used throughout the system', enum: ['en', 'de'] })
  defaultLanguage!: 'en' | 'de';

  @ApiProperty({ description: 'Whether a system language has been saved' })
  configured!: boolean;
}
