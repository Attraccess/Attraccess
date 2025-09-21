import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import emailConfiguration from './email.config';

describe('EmailConfiguration', () => {
  const testCases = [
    { value: 'true', expected: true },
    { value: 'false', expected: false },
    { value: '', expected: false },
    { value: undefined, expected: false },
    { value: 'anything', expected: false },
  ];

  testCases.forEach(({ value, expected }) => {
    it(`should parse SMTP_SECURE=${value} as ${expected}`, async () => {
      // Clear and set environment variables
      delete process.env.SMTP_SERVICE;
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_FROM;
      delete process.env.SMTP_SECURE;

      process.env.SMTP_SERVICE = 'SMTP';
      process.env.SMTP_HOST = 'localhost';
      process.env.SMTP_PORT = '1025';
      process.env.SMTP_FROM = 'test@example.com';

      if (value !== undefined) {
        process.env.SMTP_SECURE = value;
      }

      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: false,
          }),
          ConfigModule.forFeature(emailConfiguration),
        ],
      }).compile();

      const config = module.get<ConfigService>(ConfigService).get('email');

      expect(config?.mailerOptions?.transport?.secure).toBe(expected);
    });
  });
});
