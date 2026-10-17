import { createMock } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EmailTemplate,
  EmailTemplateType,
  Resource,
  ResourceIntroducer,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { createTransport } from 'nodemailer';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../email-template/email-defaults';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { PushService } from '../push/push.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ResourceSessionNotificationListener } from '../resources/usage/notifications/session.listener';
import { ResourceUsageNoteNotificationListener } from '../resources/usage/notifications/notes.listener';
import {
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../resources/usage/events/resource-usage.events';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationLiveService } from './notification-live.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('Notification email language fallback', () => {
  const resource = { id: 4, name: 'Laser', groups: [] } as Resource;
  const recipient = { id: 2, username: 'bob', email: 'bob@example.com', locale: 'fr' } as User;
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const settings = createMock<SettingsService>();
  const templates = createMock<EmailTemplateService>();
  const push = createMock<PushService>();
  let sessions: ResourceSessionNotificationListener;
  let notes: ResourceUsageNoteNotificationListener;

  beforeEach(async () => {
    jest.clearAllMocks();
    recipient.locale = 'fr';
    settings.getDefaultLanguage.mockResolvedValue('de');
    settings.resolveLanguage.mockImplementation((locale) =>
      SettingsService.prototype.resolveLanguage.call(settings, locale),
    );
    settings.getUrl.mockResolvedValue('https://example.com');
    templates.findOne.mockImplementation(
      async (type) =>
        ({
          type,
          subject: EMAIL_TEMPLATE_DEFAULTS[type].subject,
          body: readDefaultTemplateBody(type),
        }) as EmailTemplate,
    );
    templates.getTranslationsMap.mockImplementation(async (type, locale) =>
      Object.fromEntries(
        SHIPPED_TRANSLATIONS.filter((entry) => entry.templateType === type && entry.locale === locale).map((entry) => [
          entry.key,
          entry.value,
        ]),
      ),
    );
    const layout = createMock<EmailLayoutService>();
    layout.renderWithTemplate.mockImplementation(async (template) => template.body);
    const timer = createMock<ExternalCallTimer>();
    timer.time.mockImplementation(async (_provider, _operation, callback) => callback());
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const preferences = createMock<NotificationPreferenceService>();
    preferences.isChannelEnabled.mockResolvedValue(true);
    const resources = createMock<Repository<Resource>>();
    resources.findOne.mockResolvedValue(resource);
    const introducers = createMock<Repository<ResourceIntroducer>>();
    introducers.find.mockResolvedValue([]);
    const users = createMock<Repository<User>>();
    users.findBy.mockResolvedValue([recipient]);
    const rbac = createMock<RbacService>();
    rbac.getUserIdsWithPermission.mockResolvedValue([recipient.id]);

    const module = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        EmailService,
        ResourceSessionNotificationListener,
        ResourceUsageNoteNotificationListener,
        { provide: SettingsService, useValue: settings },
        { provide: EmailTemplateService, useValue: templates },
        { provide: EmailLayoutService, useValue: layout },
        { provide: MetricsService, useValue: createMock<MetricsService>() },
        { provide: ExternalCallTimer, useValue: timer },
        { provide: NotificationPreferenceService, useValue: preferences },
        { provide: NotificationLiveService, useValue: createMock<NotificationLiveService>() },
        { provide: PushService, useValue: push },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Resource), useValue: resources },
        { provide: getRepositoryToken(ResourceIntroducer), useValue: introducers },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();
    sessions = module.get(ResourceSessionNotificationListener);
    notes = module.get(ResourceUsageNoteNotificationListener);
  });

  async function notifyWithoutActorNames() {
    await sessions.handleSessionEnded(
      new ResourceUsageSessionEndedEvent(
        {
          id: 10,
          user: recipient,
          userId: recipient.id,
          resource,
          resourceId: resource.id,
          endTime: null,
        } as ResourceUsage,
        null,
      ),
    );
    await sessions.handleTakenOver(
      new ResourceUsageSessionTakenOverEvent(resource, new Date(), { id: 1 } as User, recipient),
    );
    await notes.handleNoteAdded(
      new ResourceUsageNoteAddedEvent(resource.id, 'Keep this note', 'end', { id: 1, username: null }),
    );
  }

  it.each([
    ['de', 'fr', 'Das System', 'Ein anderer Benutzer', 'Ein Benutzer'],
    ['de', undefined, 'Das System', 'Ein anderer Benutzer', 'Ein Benutzer'],
    ['de', 'de-u-12', 'Das System', 'Ein anderer Benutzer', 'Ein Benutzer'],
    ['de', 'en-US', 'The system', 'Another user', 'A user'],
    ['en', 'de-AT', 'Das System', 'Ein anderer Benutzer', 'Ein Benutzer'],
    ['en', 'fr', 'The system', 'Another user', 'A user'],
  ] as const)(
    'uses default %s and preference %s consistently for email context and push',
    async (fallback, locale, system, user, author) => {
      settings.getDefaultLanguage.mockResolvedValue(fallback);
      recipient.locale = locale;
      await notifyWithoutActorNames();
      expect(sendMail).toHaveBeenCalledTimes(3);
      for (const [index, name] of [system, user, author].entries()) {
        expect(sendMail.mock.calls[index][0].html).toContain(name);
        expect(push.sendToUser.mock.calls[index][1].body).toContain(name);
      }
      expect(sendMail.mock.calls[2][0].html).toContain('Keep this note');
      expect(recipient.locale).toBe(locale);
    },
  );

  it('keeps custom locale catalogs available while translating callback text with the system fallback', async () => {
    const getTranslations = templates.getTranslationsMap.getMockImplementation();
    templates.getTranslationsMap.mockImplementation(async (type, locale) =>
      locale === 'fr' ? { subject: 'Sujet personnalisé' } : getTranslations(type, locale),
    );
    await notifyWithoutActorNames();
    expect(sendMail.mock.calls[0][0]).toEqual(
      expect.objectContaining({ subject: 'Sujet personnalisé', html: expect.stringContaining('Das System') }),
    );
    expect(templates.getTranslationsMap).toHaveBeenCalledWith(EmailTemplateType.RESOURCE_SESSION_ENDED, 'fr');
    expect(recipient.locale).toBe('fr');
  });

  it('preserves supplied actor names in all email callbacks', async () => {
    const actor = { id: 1, username: 'Alice & Bob' } as User;
    await sessions.handleSessionEnded(
      new ResourceUsageSessionEndedEvent(
        {
          id: 10,
          user: recipient,
          userId: recipient.id,
          resource,
          resourceId: resource.id,
          endTime: null,
        } as ResourceUsage,
        actor,
      ),
    );
    await sessions.handleTakenOver(new ResourceUsageSessionTakenOverEvent(resource, new Date(), actor, recipient));
    await notes.handleNoteAdded(new ResourceUsageNoteAddedEvent(resource.id, 'Keep this note', 'end', actor));
    expect(sendMail).toHaveBeenCalledTimes(3);
    for (const [mail] of sendMail.mock.calls) {
      expect(mail.html).toContain('Alice &amp; Bob');
      expect(mail.html).toContain('Laser');
    }
  });
});
