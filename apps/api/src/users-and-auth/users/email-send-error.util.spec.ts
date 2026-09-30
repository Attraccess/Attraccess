import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { mapEmailSendError } from './email-send-error.util';

describe('mapEmailSendError', () => {
  it('maps missing SMTP configuration to a client-safe configuration error', () => {
    expect(() => mapEmailSendError(new Error('SMTP configuration not set'))).toThrow(BadRequestException);
  });

  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'])(
    'maps transient transport failure %s to a service-unavailable error',
    (code) => {
      const error = Object.assign(new Error('transport failed'), { code });
      expect(() => mapEmailSendError(error)).toThrow(ServiceUnavailableException);
    },
  );

  it('rethrows unrelated errors unchanged', () => {
    const error = new Error('unrelated');
    expect(() => mapEmailSendError(error)).toThrow(error);
  });
});
