import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplateType } from '@attraccess/application-models';

@Entity('email_templates')
export class EmailTemplate {
  @ApiProperty({
    description: 'Template type/key used by the system',
    example: 'verify-email',
    enum: EmailTemplateType,
    enumName: 'EmailTemplateType',
  })
  @PrimaryColumn({ type: 'varchar', length: 255 })
  type!: EmailTemplateType;

  @ApiProperty({ description: 'Email subject line', example: 'Verify Your Email Address' })
  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @ApiProperty({ description: 'MJML content of the email body' })
  @Column({ type: 'text' })
  body!: string;

  @ApiProperty({ description: 'Variables used in the email body', example: ['{{name}}', '{{url}}'] })
  @Column({ type: 'simple-array' })
  variables!: string[];

  @ApiProperty({ description: 'Timestamp of when the template was created' })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp of when the template was last updated' })
  @UpdateDateColumn()
  updatedAt!: Date;
}

export { EmailTemplateType } from '@attraccess/application-models';
