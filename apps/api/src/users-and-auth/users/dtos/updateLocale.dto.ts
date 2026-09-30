import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateLocaleDto {
  @ApiProperty({ description: 'BCP 47 language tag (e.g. "en", "de")', example: 'de' })
  @IsString()
  @MaxLength(10)
  locale!: string;
}
