import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ValidateBy } from 'class-validator';
import { DateTimePreferences, validateDateTimeLocale, DATE_TIME_LOCALE_MAX_LENGTH } from '@attraccess/shared';

export class UpdateDateTimePreferencesDto implements DateTimePreferences {
  @ApiProperty({ type: String, nullable: true, maxLength: DATE_TIME_LOCALE_MAX_LENGTH, example: 'en-GB' })
  // Preserve the request type despite the app-wide implicit conversion setting.
  @Transform(({ obj, key }) => obj[key])
  @ValidateBy({
    name: 'dateTimeLocale',
    validator: {
      validate: (value: unknown) => value === null || !validateDateTimeLocale(value).error,
      defaultMessage: () => 'dateTimeLocale must be null or a supported locale code (for example en-GB)',
    },
  })
  dateTimeLocale!: string | null;
}
