import { SmtpServiceType } from './dto/smtp-settings.dto';

export type SmtpSettingsInternal = {
  service: SmtpServiceType | null;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  user: string | null;
  pass: string | null;
  from: string | null;
  passConfigured: boolean;
};
export const SMTP_VERIFY_TIMEOUT_MS = 10_000;
export const SMTP_ERROR_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Could not connect to the SMTP server. Verify the host and port are correct and the server is running.',
  ENOTFOUND: 'DNS lookup failed for the SMTP host. Verify the hostname is correct.',
  ETIMEDOUT: 'Connection to the SMTP server timed out. Verify the host, port, and firewall settings.',
  ESOCKET: 'TLS/SSL error connecting to the SMTP server. Check the secure setting and port configuration.',
  ECONNRESET: 'Connection to the SMTP server was reset. This may indicate a TLS configuration issue.',
  EDNS: 'DNS resolution failed for the SMTP host. Verify the hostname is correct.',
  EAI_AGAIN: 'Temporary DNS resolution failure. Please try again.',
  EENVELOPE: 'Invalid envelope: check the FROM address format.',
  EMESSAGE: 'Failed to send test email. The server rejected the message.',
};
