import { ApiProperty } from '@nestjs/swagger';

export enum SmtpServiceType {
  SMTP = 'SMTP',
  Outlook365 = 'Outlook365',
}

export class SmtpSettingsDto {
  @ApiProperty({
    description: 'Selected SMTP provider type.',
    enum: SmtpServiceType,
    enumName: 'SmtpServiceType',
    nullable: true,
  })
  service!: SmtpServiceType | null;

  @ApiProperty({
    description: 'SMTP host for direct SMTP connections.',
    example: 'smtp.example.com',
    nullable: true,
  })
  host!: string | null;

  @ApiProperty({
    description: 'SMTP port for direct SMTP connections.',
    example: 587,
    nullable: true,
  })
  port!: number | null;

  @ApiProperty({
    description: 'Whether to use a secure SMTP connection.',
    example: false,
    nullable: true,
  })
  secure!: boolean | null;

  @ApiProperty({
    description: 'SMTP username.',
    example: 'no-reply@example.com',
    nullable: true,
  })
  user!: string | null;

  @ApiProperty({
    description: 'Default FROM address for outgoing emails.',
    example: 'no-reply@example.com',
    nullable: true,
  })
  from!: string | null;

  @ApiProperty({
    description: 'Whether an SMTP password has been configured.',
    example: true,
  })
  passConfigured!: boolean;
}
