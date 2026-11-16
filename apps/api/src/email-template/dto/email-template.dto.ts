import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplateType } from '@attraccess/application-models';

/**
 * Response shape of a stored email template. The class keeps the name `EmailTemplate`, which is the schema name the
 * published API description and the generated clients use.
 */
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
}
