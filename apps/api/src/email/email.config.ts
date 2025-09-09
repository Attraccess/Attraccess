import { registerAs } from '@nestjs/config';
import { MailerOptions } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { z } from 'zod';

const EmailEnvSchema = z.object({
  SMTP_SERVICE: z.enum(['SMTP', 'Outlook365']).optional(),
});

const SMTP_ENV_SCHEMA = z.object({
  SMTP_HOST: z.string().min(1, { message: 'SMTP_HOST is required' }),
  SMTP_PORT: z.coerce.number().positive({ message: 'SMTP_PORT must be a positive number' }),
  SMTP_SECURE: z.string().transform((val) => val.toLowerCase() === 'true').default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(1, { message: 'SMTP_FROM email is required' }),
});

const OUTLOOK_ENV_SCHEMA = z.object({
  SMTP_FROM: z.string().min(1, { message: 'SMTP_FROM email is required' }),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const handlebarsAdapter = new HandlebarsAdapter();

export interface EmailConfiguration {
  mailerOptions: MailerOptions;
}

const emailConfigFactory = (): EmailConfiguration => {
  const baseEnv = EmailEnvSchema.parse(process.env);

  const defaultMailerOptions = {
    template: {
      adapter: handlebarsAdapter,
      options: {
        strict: true,
      },
    },
  } as EmailConfiguration['mailerOptions'];

  if (baseEnv.SMTP_SERVICE === 'SMTP') {
    const smtpEnv = SMTP_ENV_SCHEMA.parse(process.env);

    return {
      mailerOptions: {
        ...defaultMailerOptions,
        defaults: {
          from: smtpEnv.SMTP_FROM,
        },
        transport: {
          host: smtpEnv.SMTP_HOST,
          port: smtpEnv.SMTP_PORT,
          secure: smtpEnv.SMTP_SECURE,
          auth: {
            user: smtpEnv.SMTP_USER,
            pass: smtpEnv.SMTP_PASS,
          },
        },
      },
    } as EmailConfiguration;
  }

  if (baseEnv.SMTP_SERVICE === 'Outlook365') {
    const outlookEnv = OUTLOOK_ENV_SCHEMA.parse(process.env);

    return {
      mailerOptions: {
        ...defaultMailerOptions,
        defaults: {
          from: outlookEnv.SMTP_FROM,
        },
        transport: {
          service: 'Outlook365',
          auth: {
            user: outlookEnv.SMTP_USER,
            pass: outlookEnv.SMTP_PASS,
          },
        },
      },
    } as EmailConfiguration;
  }
};

export default registerAs('email', emailConfigFactory);
