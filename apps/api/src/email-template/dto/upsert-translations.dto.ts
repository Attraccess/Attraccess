import { ApiProperty } from '@nestjs/swagger';
import { registerDecorator, ValidationOptions, IsObject, IsString, Matches, MaxLength } from 'class-validator';

function IsStringRecord(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'IsStringRecord',
      target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
      propertyName,
      options: { message: 'translations values must all be strings', ...options },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'object' && value !== null && Object.values(value).every((v) => typeof v === 'string'),
      },
    });
}

export class UpsertTranslationsDto {
  @ApiProperty({
    description: 'Map of translation key → translated value for the given locale',
    example: { greeting: 'Hallo', 'health.cta': 'Ressource öffnen' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  @IsStringRecord()
  translations!: Record<string, string>;

  @ApiProperty({ description: 'BCP 47 locale tag', example: 'de' })
  @IsString()
  @MaxLength(10)
  @Matches(/^[a-z]{2,3}(-[A-Z]{2,3})?$/, { message: 'locale must be a BCP 47 tag such as "de" or "en-US"' })
  locale!: string;
}
