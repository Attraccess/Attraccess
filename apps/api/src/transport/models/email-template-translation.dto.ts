import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplateType } from './email-template.dto';
import type { ResponseFields } from '../response-mapper';

export class EmailTemplateTranslation {
  @ApiProperty({ enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  templateType!: EmailTemplateType;

  @ApiProperty({ description: 'Translation key as used in {{t "key" "default"}} helper', example: 'greeting' })
  key!: string;

  @ApiProperty({ description: 'BCP 47 locale tag', example: 'de' })
  locale!: string;

  @ApiProperty({ description: 'Translated value', example: 'Hallo {name},' })
  value!: string;
  static readonly responseFields: ResponseFields = { templateType: null, key: null, locale: null, value: null };
}
