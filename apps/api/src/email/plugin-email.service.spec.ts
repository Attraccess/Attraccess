import { User } from '@attraccess/database-entities';
import { createTransport } from 'nodemailer';
import { Repository } from 'typeorm';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import { MjmlService } from '../email-template/mjml.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PluginEmailService } from './plugin-email.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

/** Host layout with a marker the tests look for; `{{content}}` is where plugin content lands. */
const LAYOUT_MJML =
  '<mjml><mj-body><mj-section><mj-column><mj-text>HOST-LAYOUT for {{user.username}}</mj-text></mj-column></mj-section>' +
  '{{content}}</mj-body></mjml>';

describe('PluginEmailService', () => {
  const alice = { id: 1, username: 'alice', email: 'alice@example.com' } as User;

  const setup = () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const settingsService = {
      getUrl: jest.fn().mockResolvedValue('https://frontend.example'),
      getSmtpConfiguration: jest.fn().mockResolvedValue({ from: 'no-reply@example.com' }),
      buildSmtpTransportOptions: jest.fn().mockReturnValue({}),
    };
    // The real layout service and MJML renderer, so content is wrapped exactly as in production.
    const layout = new EmailLayoutService(
      { getPlainSetting: jest.fn().mockResolvedValue(LAYOUT_MJML) } as unknown as SettingsStoreService,
      new MjmlService(),
    );
    const metricsService = { emailSentTotal: { inc: jest.fn() } };
    const userRepository = { findOne: jest.fn() };
    const service = new PluginEmailService(
      settingsService as unknown as SettingsService,
      {} as EmailTemplateService,
      layout,
      metricsService as unknown as MetricsService,
      { time: <T>(_target: string, _operation: string, fn: () => Promise<T>) => fn() } as ExternalCallTimer,
      userRepository as unknown as Repository<User>,
    );
    return { service, sendMail, settingsService, metricsService, userRepository };
  };

  const sentMail = (sendMail: jest.Mock) => sendMail.mock.calls[0][0];

  it('wraps text content in the host layout, escaped and split into paragraphs', async () => {
    const { service, sendMail, metricsService } = setup();
    await service.sendPluginEmail(alice, {
      subject: 'Booking reminder',
      text: 'Hello <b>Bob</b> & co\nsecond line\n\nNew paragraph',
    });

    const mail = sentMail(sendMail);
    expect(mail).toMatchObject({ to: 'alice@example.com', subject: 'Booking reminder' });
    expect(mail.html).toContain('HOST-LAYOUT for alice');
    expect(mail.html).toContain('<p>Hello &lt;b&gt;Bob&lt;/b&gt; &amp; co<br>second line</p><p>New paragraph</p>');
    expect(mail.html).not.toContain('<b>Bob</b>');
    expect(mail.text).toBe('Hello <b>Bob</b> & co\nsecond line\n\nNew paragraph');
    expect(metricsService.emailSentTotal.inc).toHaveBeenCalledWith({ status: 'success' });
  });

  it('keeps template syntax in plugin content literal instead of evaluating it', async () => {
    const { service, sendMail } = setup();
    await service.sendPluginEmail(alice, { subject: 'S', text: 'Your name is {{user.email}} {{{host.frontend}}}' });

    const { html } = sentMail(sendMail);
    expect(html).toContain('Your name is {{user.email}} {{{host.frontend}}}');
    expect(html).not.toContain('Your name is alice@example.com');
  });

  it('passes trusted html through unchanged and forwards the text part', async () => {
    const { service, sendMail } = setup();
    await service.sendPluginEmail(alice, {
      subject: 'S',
      html: '<p><a href="https://frontend.example/reservations/4">Open {{literal}}</a></p>',
      text: 'Open https://frontend.example/reservations/4',
    });

    const mail = sentMail(sendMail);
    expect(mail.html).toContain('HOST-LAYOUT for alice');
    expect(mail.html).toContain('<p><a href="https://frontend.example/reservations/4">Open {{literal}}</a></p>');
    expect(mail.text).toBe('Open https://frontend.example/reservations/4');
  });

  it('resolves a recipient without an email address by id', async () => {
    const { service, sendMail, userRepository } = setup();
    userRepository.findOne.mockResolvedValue(alice);
    await service.sendPluginEmail({ id: 1 } as User, { subject: 'S', text: 'T' });

    expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(sentMail(sendMail).to).toBe('alice@example.com');
  });

  it('skips recipients that have no email address or no longer exist', async () => {
    const { service, sendMail, userRepository, metricsService } = setup();
    userRepository.findOne.mockResolvedValueOnce({ id: 2, username: 'noaddress', email: null } as unknown as User);
    userRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.sendPluginEmail({ id: 2 } as User, { subject: 'S', text: 'T' })).resolves.toBeUndefined();
    await expect(service.sendPluginEmail({ id: 3 } as User, { subject: 'S', text: 'T' })).resolves.toBeUndefined();

    expect(sendMail).not.toHaveBeenCalled();
    expect(metricsService.emailSentTotal.inc).not.toHaveBeenCalled();
  });

  it('counts a failed delivery and rethrows', async () => {
    const { service, sendMail, metricsService } = setup();
    sendMail.mockRejectedValue(new Error('smtp down'));

    await expect(service.sendPluginEmail(alice, { subject: 'S', text: 'T' })).rejects.toThrow('smtp down');
    expect(metricsService.emailSentTotal.inc).toHaveBeenCalledWith({ status: 'fail' });
    expect(metricsService.emailSentTotal.inc).not.toHaveBeenCalledWith({ status: 'success' });
  });

  it('counts a rendering failure and rethrows', async () => {
    const { service, sendMail, settingsService, metricsService } = setup();
    settingsService.getUrl.mockResolvedValue(null);

    await expect(service.sendPluginEmail(alice, { subject: 'S', text: 'T' })).rejects.toThrow(
      'Application URL not configured',
    );
    expect(sendMail).not.toHaveBeenCalled();
    expect(metricsService.emailSentTotal.inc).toHaveBeenCalledWith({ status: 'fail' });
  });
});
