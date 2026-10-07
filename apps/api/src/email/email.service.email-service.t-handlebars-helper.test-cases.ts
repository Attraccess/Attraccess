import { EmailTemplateType } from '@attraccess/database-entities';
import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerTHandlebarsHelperCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  describe('{{t}} Handlebars helper', () => {
    const setupT = (translationsMap: Record<string, string> = {}, templateBody?: string) => {
      const base = fixture.setup();
      const body =
        templateBody ??
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'greeting' 'Hello {name}!' name=user.username}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>';

      base.emailTemplateService.findOne.mockImplementation((type: EmailTemplateType) => {
        if (type === EmailTemplateType.VERIFY_EMAIL) {
          return Promise.resolve({ type, subject: 'Test', body });
        }
        return Promise.reject(new Error('Unexpected template type'));
      });
      base.emailTemplateService.getTranslationsMap.mockResolvedValue(translationsMap);
      return base;
    };

    it('interpolates {var} placeholders from hash args using the default value', async () => {
      const { service, sendMail } = setupT({});
      await service.sendVerificationEmail(fixture.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });

    it('uses DB translation over default and still interpolates {var}', async () => {
      const { service, sendMail } = setupT({ greeting: 'Hallo {name}!' });
      await service.sendVerificationEmail(fixture.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hallo alice!');
      expect(html).not.toContain('Hello alice!');
    });

    it('leaves unresolved {var} literals intact when hash arg is missing', async () => {
      const { service, sendMail } = setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'k' 'Value: {missing}'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await service.sendVerificationEmail(fixture.makeUser(), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('{missing}');
    });

    it('escapes HTML-dangerous characters in interpolated values', async () => {
      const { service, sendMail } = setupT({});
      await service.sendVerificationEmail(fixture.makeUser({ username: '<script>alert(1)</script>' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not double-escape HTML tags present in the translation string itself', async () => {
      const { service, sendMail } = setupT({ greeting: '<strong>{name}</strong>' });
      await service.sendVerificationEmail(fixture.makeUser({ username: 'alice' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('<strong>alice</strong>');
      expect(html).not.toContain('&lt;strong&gt;');
    });

    it('does not crash when called with one arg (no defaultValue)', async () => {
      const { service, sendMail } = setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'greeting'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await expect(service.sendVerificationEmail(fixture.makeUser(), 'tok')).resolves.not.toThrow();
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toBeDefined();
    });

    it('falls back to default when DB translation is an empty string', async () => {
      const { service, sendMail } = setupT({ greeting: '' });
      await service.sendVerificationEmail(fixture.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });
  });
}
