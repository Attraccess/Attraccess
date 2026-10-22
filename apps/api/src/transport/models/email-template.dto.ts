import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplateType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class EmailTemplate {
  @ApiProperty({
    description: 'Template type/key used by the system',
    example: 'verify-email',
    enum: EmailTemplateType,
    enumName: 'EmailTemplateType',
  })
  type!: EmailTemplateType;

  @ApiProperty({ description: 'Email subject line', example: 'Verify Your Email Address' })
  subject!: string;

  @ApiProperty({ description: 'MJML content of the email body' })
  body!: string;

  @ApiProperty({ description: 'Variables used in the email body', example: ['{{name}}', '{{url}}'] })
  variables!: string[];

  @ApiProperty({ description: 'Timestamp of when the template was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp of when the template was last updated' })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    type: null,
    subject: null,
    body: null,
    variables: null,
    createdAt: null,
    updatedAt: null,
  };
}

export { EmailTemplateType } from '@attraccess/application-models';
