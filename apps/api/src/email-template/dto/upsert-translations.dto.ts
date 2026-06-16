import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

export class UpsertTranslationsDto {
  @ApiProperty({
    description: 'Map of translation key → translated value for the given locale',
    example: { greeting: 'Hallo', 'health.cta': 'Ressource öffnen' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  translations!: Record<string, string>;

  @ApiProperty({ description: 'BCP 47 locale tag', example: 'de' })
  @IsString()
  locale!: string;
}
