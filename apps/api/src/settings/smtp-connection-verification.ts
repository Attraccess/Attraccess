import { BadRequestException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { SmtpSettingsStorageImplementation } from './smtp-settings-storage';
import {
  SMTP_ERROR_MESSAGES,
  SMTP_VERIFY_TIMEOUT_MS,
  SmtpSettingsInternal,
} from './smtp-settings.service.feature-definitions';
export abstract class SmtpConnectionVerificationImplementation extends SmtpSettingsStorageImplementation {
  protected async verifySmtpConnection(config: SmtpSettingsInternal): Promise<void> {
    const transportOptions = this.buildTransportOptions(config);
    const transporter = createTransport(transportOptions);
    let phase: 'verify' | 'sendMail' = 'verify';

    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('SMTP verification timed out')), SMTP_VERIFY_TIMEOUT_MS);

        transporter
          .verify()
          .then(() => {
            clearTimeout(timeoutId);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
      });

      phase = 'sendMail';
      await transporter.sendMail({
        from: config.from ?? '',
        to: config.from ?? '',
        subject: 'Attraccess SMTP Configuration Test',
        text: 'This is an automated test email to verify your SMTP configuration. If you received this email, your SMTP settings are working correctly.',
      });
    } catch (error) {
      const prefix =
        phase === 'verify'
          ? 'SMTP connection verification failed'
          : 'SMTP verification succeeded but sending a test email failed';
      throw this.buildSmtpError(prefix, error);
    } finally {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    }
  }

  protected buildSmtpError(prefix: string, error: unknown): BadRequestException {
    const err = error instanceof Error ? error : new Error(String(error));
    const code = (err as NodeJS.ErrnoException).code;
    const responseCode = (err as { responseCode?: number }).responseCode;

    let detail: string;
    if (code && SMTP_ERROR_MESSAGES[code]) {
      detail = SMTP_ERROR_MESSAGES[code];
    } else if (responseCode === 535 || (err.message && /auth/i.test(err.message))) {
      detail = 'SMTP authentication failed. Verify your username and password.';
    } else {
      detail = err.message || 'Unknown error';
    }

    this.logger.warn(`${prefix}: [${code ?? responseCode ?? 'UNKNOWN'}] ${err.message}`);
    return new BadRequestException(`${prefix}: ${detail}`);
  }
}
