import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum EmailTemplateType {
  VERIFY_EMAIL = 'verify-email',
  USER_INVITATION = 'user-invitation',
  RESET_PASSWORD = 'reset-password',
  USERNAME_CHANGED = 'username-changed',
  PASSWORD_CHANGED = 'password-changed',
  RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY = 'resource-usage-billing-transaction-summary',
  PROJECT_INVITATION = 'project-invitation',
  DELETE_ACCOUNT_CONFIRMATION = 'delete-account-confirmation',
  RESOURCE_HEALTH_CHANGED = 'resource-health-changed',
  USER_RETRAINING_REQUIRED = 'user-retraining-required',
  MAINTENANCE_REQUEST_CREATED = 'maintenance-request-created',
  MESSAGE_RECEIVED = 'message-received',
  RESOURCE_USAGE_NOTE_ADDED = 'resource-usage-note-added',
}

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
