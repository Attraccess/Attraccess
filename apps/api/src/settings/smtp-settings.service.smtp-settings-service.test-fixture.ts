import { createTransport } from 'nodemailer';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsInternal, SmtpSettingsService } from './smtp-settings.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const makeSettingsStore = () => ({
  getPlainSetting: jest.fn().mockResolvedValue(null),
  getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
  setPlainSetting: jest.fn().mockResolvedValue(undefined),
  setSecretSetting: jest.fn().mockResolvedValue(undefined),
});

const makeSmtpConfig = (overrides: Partial<SmtpSettingsInternal> = {}): SmtpSettingsInternal => ({
  service: SmtpServiceType.SMTP,
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'user@example.com',
  pass: 'secret',
  from: 'no-reply@example.com',
  passConfigured: true,
  ...overrides,
});

const makeUpdateDto = (overrides: Partial<UpdateSmtpSettingsDto> = {}): UpdateSmtpSettingsDto => ({
  service: SmtpServiceType.SMTP,
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'user@example.com',
  pass: 'secret',
  from: 'no-reply@example.com',
  ...overrides,
});

const setupMockTransporter = (verifyResult: unknown = undefined, sendMailResult: unknown = undefined) => {
  const verify = typeof verifyResult === 'function' ? verifyResult : jest.fn().mockResolvedValue(verifyResult ?? true);
  const sendMail =
    typeof sendMailResult === 'function'
      ? sendMailResult
      : jest.fn().mockResolvedValue(sendMailResult ?? { messageId: 'test-id' });
  const close = jest.fn();
  (createTransport as jest.Mock).mockReturnValue({ verify, sendMail, close });
  return { verify, sendMail, close };
};

const setupService = () => {
  const store = makeSettingsStore();
  const service = new SmtpSettingsService(store as unknown as SettingsStoreService);
  return { service, store };
};

const configureStoreWithSmtp = (store: ReturnType<typeof makeSettingsStore>, config: SmtpSettingsInternal) => {
  store.getPlainSetting.mockImplementation((_parent: string, key: string) => {
    const map: Record<string, string | null> = {
      service: config.service,
      host: config.host,
      port: config.port !== null ? String(config.port) : null,
      secure: config.secure !== null ? String(config.secure) : null,
      user: config.user,
      from: config.from,
    };
    return Promise.resolve(map[key] ?? null);
  });
  store.getSecretSetting.mockResolvedValue({
    value: config.pass,
    configured: config.passConfigured,
  });
};
export function registerSmtpSettingsServiceFixture() {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  return {
    get makeSmtpConfig() {
      return makeSmtpConfig;
    },
    get makeUpdateDto() {
      return makeUpdateDto;
    },
    get setupMockTransporter() {
      return setupMockTransporter;
    },
    get setupService() {
      return setupService;
    },
    get configureStoreWithSmtp() {
      return configureStoreWithSmtp;
    },
  };
}
