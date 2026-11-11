import { EmailTemplate, EmailTemplateTranslation, User } from '@attraccess/database-entities';
import type { PluginEmailTemplate } from '@attraccess/plugins-backend-sdk';
import { createTransport } from 'nodemailer';
import { DataSource, Repository } from 'typeorm';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import { MjmlService } from '../email-template/mjml.service';
import { registerPluginEmailTemplates, unregisterPluginEmailTemplates } from '../email-template/plugin-email-templates';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PluginEmailService } from './plugin-email.service';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };
const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const LAYOUT_MJML =
  '<mjml><mj-body><mj-section><mj-column><mj-text>HOST-LAYOUT</mj-text></mj-column></mj-section>{{content}}</mj-body></mjml>';

const confirmed: PluginEmailTemplate = {
  id: 'confirmed',
  label: { en: 'Confirmed', de: 'Bestätigt' },
  variables: ['reservation.when'],
  subject: '{{t "subject" "Confirmed: {resource}" resource=resource.name}}',
  body:
    '<mj-section><mj-column><mj-text>{{t "greeting" "Hello {name}," name=user.username}}</mj-text>' +
    '<mj-text>{{t "body" "Booked {when}" when=reservation.when}}</mj-text>' +
    '<mj-button href="{{host.frontend}}/reservations/{{reservation.id}}">{{t "open" "Open"}}</mj-button></mj-column></mj-section>',
  translations: {
    de: { subject: 'Bestätigt: {resource}', greeting: 'Hallo {name},', body: 'Gebucht {when}', open: 'Öffnen' },
  },
};

describe('PluginEmailService.sendPluginTemplate (real template store)', () => {
  let dataSource: DataSource;
  let service: PluginEmailService;
  let sendMail: jest.Mock;
  const alice = { id: 1, username: 'alice', email: 'alice@example.com', locale: 'en' } as User;
  const bob = { id: 2, username: 'bob', email: 'bob@example.com', locale: 'de' } as User;

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [EmailTemplate, EmailTemplateTranslation],
    }).initialize();
    const templates = new EmailTemplateService(
      dataSource.getRepository(EmailTemplate),
      dataSource.getRepository(EmailTemplateTranslation),
      new MjmlService(),
      audit as never,
    );
    sendMail = jest.fn().mockResolvedValue(undefined);
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const settings = {
      getUrl: jest.fn().mockResolvedValue('https://frontend.example'),
      getDefaultLanguage: jest.fn().mockResolvedValue('en'),
      getSmtpConfiguration: jest.fn().mockResolvedValue({ from: 'no-reply@example.com' }),
      buildSmtpTransportOptions: jest.fn().mockReturnValue({}),
    };
    service = new PluginEmailService(
      settings as unknown as SettingsService,
      templates,
      new EmailLayoutService(
        { getPlainSetting: jest.fn().mockResolvedValue(LAYOUT_MJML) } as unknown as SettingsStoreService,
        new MjmlService(),
        audit as never,
      ),
      { emailSentTotal: { inc: jest.fn() } } as unknown as MetricsService,
      { time: <T>(_target: string, _operation: string, fn: () => Promise<T>) => fn() } as ExternalCallTimer,
      { findOne: jest.fn() } as unknown as Repository<User>,
    );
    registerPluginEmailTemplates('demo', [confirmed]);
  });

  afterEach(async () => {
    unregisterPluginEmailTemplates('demo');
    await dataSource.destroy();
  });

  const variables = { resource: { name: 'Laser <1>' }, reservation: { id: 7, when: 'Mon 14:00' } };

  it('renders the stored template in the layout, in English by default, escaping variables', async () => {
    await service.sendPluginTemplate('demo', alice, 'confirmed', variables);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('alice@example.com');
    expect(mail.subject).toBe('Confirmed: Laser &lt;1&gt;');
    expect(mail.html).toContain('HOST-LAYOUT');
    expect(mail.html).toContain('Hello alice,');
    expect(mail.html).toContain('Booked Mon 14:00');
    expect(mail.html).toContain('href="https://frontend.example/reservations/7"');
  });

  it('renders the shipped German text for a German recipient (the plugin never picks the language)', async () => {
    await service.sendPluginTemplate('demo', bob, 'confirmed', variables);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Bestätigt: Laser &lt;1&gt;');
    expect(mail.html).toContain('Hallo bob,');
    expect(mail.html).toContain('Öffnen');
  });

  it('uses what the admin edited, not the shipped defaults', async () => {
    const templates = (service as unknown as { emailTemplateService: EmailTemplateService }).emailTemplateService;
    await templates.findOne('plugin.demo.confirmed' as never);
    await templates.update(
      'plugin.demo.confirmed' as never,
      {
        subject: '{{t "subject" "Edited {resource}" resource=resource.name}}',
      },
      ACTOR,
    );
    await templates.setTranslations(
      'plugin.demo.confirmed' as never,
      'de',
      { subject: 'Bearbeitet {resource}' },
      ACTOR,
    );
    await service.sendPluginTemplate('demo', alice, 'confirmed', variables);
    await service.sendPluginTemplate('demo', bob, 'confirmed', variables);
    expect(sendMail.mock.calls[0][0].subject).toBe('Edited Laser &lt;1&gt;');
    expect(sendMail.mock.calls[1][0].subject).toBe('Bearbeitet Laser &lt;1&gt;');
  });

  it('keeps plugin variables from replacing the host user, host and url', async () => {
    await service.sendPluginTemplate('demo', alice, 'confirmed', {
      ...variables,
      user: { username: 'mallory' },
      host: { frontend: 'https://evil.example' },
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Hello alice,');
    expect(mail.html).not.toContain('evil.example');
  });

  it('refuses a template the plugin did not declare', async () => {
    await expect(service.sendPluginTemplate('demo', alice, 'unknown', variables)).rejects.toThrow(
      /undeclared email template/,
    );
    await expect(service.sendPluginTemplate('other', alice, 'confirmed', variables)).rejects.toThrow(/undeclared/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('refuses a template of another plugin whose name extends this one with a "."', async () => {
    registerPluginEmailTemplates('demo.x', [{ ...confirmed, id: 'secret' }]);
    try {
      // `plugin.demo` + `x.secret` is the key of plugin `demo.x`'s template `secret`.
      await expect(service.sendPluginTemplate('demo', alice, 'x.secret', variables)).rejects.toThrow(/undeclared/);
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      unregisterPluginEmailTemplates('demo.x');
    }
  });

  it('sends nothing to a recipient without an email address', async () => {
    await service.sendPluginTemplate('demo', { ...alice, email: '' } as User, 'confirmed', variables);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
